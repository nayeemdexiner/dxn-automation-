import crypto from 'node:crypto';
import { appStore } from '../db/store.ts';
import { getPostgresPool } from '../db/postgres.ts';
import { fastFAQMatch } from '../server/webhooks/whatsapp.ts';
import { detectLanguage, classifyInboundMessage, generateGroundedResponse } from './gemini.ts';
import { evaluateReplyPolicy } from './replyPolicy.ts';
import { sendWhatsAppMessage, isWithinWhatsApp24HourWindow } from './whatsapp.ts';
import { sendTelegramMessage, formatWhatsAppInboundAlert } from './telegram.ts';
import { ClassificationResult } from '../types/index.ts';

export interface ReplyJob {
  id: string;
  messageId: string;
  contactId: string;
  phoneNumber: string;
  senderName: string;
  text: string;
  rawPayload?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory queue fallback
const memoryQueue: ReplyJob[] = [];
let isWorkerRunning = false;

/**
 * Initializes the Postgres reply_jobs table if connected.
 */
export async function ensureJobQueueTable(): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reply_jobs (
        id VARCHAR(100) PRIMARY KEY,
        message_id VARCHAR(100) NOT NULL,
        contact_id VARCHAR(100) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        raw_payload JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reply_jobs_status ON reply_jobs(status);
    `);
  } catch (err: unknown) {
    console.warn('[Job Queue Table Warning]:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Enqueues an inbound WhatsApp message for asynchronous durable processing.
 */
export async function enqueueReplyJob(params: {
  messageId: string;
  contactId: string;
  phoneNumber: string;
  senderName: string;
  text: string;
  rawPayload?: Record<string, unknown>;
}): Promise<ReplyJob> {
  const job: ReplyJob = {
    id: `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    messageId: params.messageId,
    contactId: params.contactId,
    phoneNumber: params.phoneNumber,
    senderName: params.senderName,
    text: params.text,
    rawPayload: params.rawPayload,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const pool = getPostgresPool();
  if (pool) {
    try {
      await ensureJobQueueTable();
      await pool.query(
        `INSERT INTO reply_jobs (id, message_id, contact_id, phone_number, sender_name, text, raw_payload, status, retry_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          job.id,
          job.messageId,
          job.contactId,
          job.phoneNumber,
          job.senderName,
          job.text,
          JSON.stringify(job.rawPayload || {}),
          job.status,
          job.retryCount,
          job.createdAt,
          job.updatedAt,
        ]
      );
    } catch (err) {
      console.warn('[Job Queue Postgres Enqueue Notice]: Falling back to in-memory store:', err);
      memoryQueue.push(job);
    }
  } else {
    memoryQueue.push(job);
  }

  // Trigger worker asynchronously
  setImmediate(() => {
    processNextJobs().catch((e) => console.error('[Job Queue Worker Error]:', e));
  });

  return job;
}

/**
 * Recovers pending/processing jobs on server boot after restart.
 */
export async function recoverPendingJobs(): Promise<number> {
  await ensureJobQueueTable();
  const pool = getPostgresPool();
  let recoveredCount = 0;

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, message_id AS "messageId", contact_id AS "contactId", phone_number AS "phoneNumber",
                sender_name AS "senderName", text, raw_payload AS "rawPayload", status, retry_count AS "retryCount",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM reply_jobs
         WHERE status IN ('pending', 'processing') AND retry_count < 3
         ORDER BY created_at ASC`
      );

      for (const row of res.rows) {
        if (!memoryQueue.some((q) => q.id === row.id)) {
          memoryQueue.push(row);
          recoveredCount++;
        }
      }
    } catch (err) {
      console.warn('[Job Recovery Postgres Warning]:', err);
    }
  }

  if (recoveredCount > 0) {
    console.log(`[Job Queue]: Recovered ${recoveredCount} pending jobs after startup. Starting background processing...`);
    setImmediate(() => {
      processNextJobs().catch((e) => console.error('[Job Queue Worker Error]:', e));
    });
  }

  return recoveredCount;
}

/**
 * Worker loop that processes jobs sequentially to prevent race conditions per contact.
 */
async function processNextJobs(): Promise<void> {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    while (memoryQueue.length > 0) {
      const job = memoryQueue.shift();
      if (!job) break;

      job.status = 'processing';
      job.updatedAt = new Date().toISOString();
      await updateJobInPostgres(job);

      try {
        await executeReplyJob(job);
        job.status = 'completed';
        job.updatedAt = new Date().toISOString();
        await updateJobInPostgres(job);
      } catch (jobErr: unknown) {
        const errorMsg = jobErr instanceof Error ? jobErr.message : String(jobErr);
        console.error(`[Job Queue Execution Error on ${job.id}]:`, errorMsg);

        job.retryCount++;
        job.error = errorMsg;
        job.updatedAt = new Date().toISOString();

        if (job.retryCount < 3) {
          job.status = 'pending';
          memoryQueue.push(job); // Retry later
        } else {
          job.status = 'failed';
        }
        await updateJobInPostgres(job);
      }
    }
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Core business logic for processing a single reply job.
 */
async function executeReplyJob(job: ReplyJob): Promise<void> {
  const contact = await appStore.getContact(job.contactId);
  if (!contact) {
    console.warn(`[Job Queue]: Contact ${job.contactId} not found, skipping job.`);
    return;
  }

  // Idempotency: verify if an outbound reply or pending approval already exists for this inbound messageId
  const existingReplies = await appStore.getMessages(contact.id);
  const alreadyReplied = existingReplies.some(
    (m) => m.direction === 'outbound' && m.rawPayload?.inboundWhatsAppMessageId === job.messageId
  );
  if (alreadyReplied) {
    console.log(`[Job Queue]: Outbound reply already recorded for messageId ${job.messageId}. Skipping duplicate dispatch.`);
    return;
  }

  // 1. Retrieve conversation history first before generating reply
  const history = await appStore.getMessages(contact.id);
  const detectedLang = detectLanguage(job.text);

  // Check if contact is continuing an ongoing conversation (messages within 2 hours)
  const recentMessages = history.slice(-6);
  const hasPriorConversation = recentMessages.length > 0;
  const lastMessage = hasPriorConversation ? recentMessages[recentMessages.length - 1] : null;
  const lastMsgTime = lastMessage ? new Date(lastMessage.createdAt).getTime() : 0;
  const isOngoingConversation = hasPriorConversation && (Date.now() - lastMsgTime < 2 * 60 * 60 * 1000);

  // Do NOT send static FAQ answer when contact is continuing an existing conversation!
  let fastMatched = null;
  if (!isOngoingConversation) {
    fastMatched = fastFAQMatch(job.text, detectedLang, contact.name);
  }

  let classification: ClassificationResult;
  let replyText: string | null = null;

  if (fastMatched) {
    classification = {
      category: 'faq_business',
      confidence: 0.98,
      detectedLanguage: detectedLang,
      reasoning: `Directly matched Muhammad Nayeem verified FAQ [${fastMatched.category}]: ${fastMatched.key}`,
      isHighImpact: false,
      isInjectionAttempt: false,
    };
    replyText = fastMatched.text;
  } else {
    classification = await classifyInboundMessage(job.text);
  }

  // 2. Evaluate reply policy
  const settings = await appStore.getSettings();
  const isWithin24h = isWithinWhatsApp24HourWindow(contact.lastInboundAt);
  const policy = evaluateReplyPolicy(classification, settings, {
    isWithin24hWindow: isWithin24h,
    contactMode: contact.mode || 'auto_reply',
    isLocked: contact.isLocked,
  });

  // If in human takeover mode or locked, notify admin and do not auto-reply
  if (contact.mode === 'human_takeover' || contact.isLocked) {
    if (settings.telegramAlertsEnabled) {
      const alert = formatWhatsAppInboundAlert({
        contact,
        messageText: job.text,
        category: classification.category,
        statusBadge: 'AI Paused (Human Takeover)',
        summary: 'Human Takeover active. AI will not reply automatically.',
      });
      await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
    }
    return;
  }

  // 3. Generate grounded response with Gemini if not satisfied by fast FAQ
  if (!replyText) {
    const kb = await appStore.getKnowledgeBase();
    const memories = await appStore.getMemories(contact.id);

    replyText = await generateGroundedResponse({
      inboundText: job.text,
      category: classification.category,
      detectedLanguage: classification.detectedLanguage,
      knowledgeBase: kb,
      recentHistory: history,
      memories,
      systemPrompt: settings.systemPrompt,
      senderName: contact.name,
    });
  }

  // 4. Send or queue for approval
  if (policy.shouldAutoSend && replyText) {
    const sendResult = await sendWhatsAppMessage(contact.phoneNumber, replyText);

    await appStore.addMessage({
      contactId: contact.id,
      direction: 'outbound',
      content: replyText,
      status: sendResult.success ? 'sent' : 'failed',
      deliveryStatus: sendResult.success ? 'sent' : 'failed',
      source: 'ai_auto_reply',
      category: classification.category,
      confidenceScore: classification.confidence,
      whatsappMessageId: sendResult.messageId,
      failureReason: sendResult.error,
      rawPayload: { inboundWhatsAppMessageId: job.messageId },
    });

    if (settings.telegramAlertsEnabled) {
      const alert = formatWhatsAppInboundAlert({
        contact,
        messageText: job.text,
        category: classification.category,
        statusBadge: 'AI Auto-Replied (FAQ/Gemini)',
        summary: `Replied with: "${replyText.slice(0, 100)}..."`,
      });
      await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
    }
  } else {
    const pending = await appStore.addPendingReply({
      messageId: job.messageId,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phoneNumber,
      inboundText: job.text,
      proposedText: replyText || 'Message held for manual review.',
      category: classification.category,
      confidenceScore: classification.confidence,
      decisionReason: policy.reason,
    });

    if (settings.telegramAlertsEnabled) {
      const alert = formatWhatsAppInboundAlert({
        contact,
        messageText: job.text,
        category: classification.category,
        statusBadge: 'Pending Approval',
        summary: `Reason: ${policy.reason}`,
        pendingReplyId: pending.id,
      });
      await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
    }
  }
}

async function updateJobInPostgres(job: ReplyJob): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;

  try {
    await pool.query(
      `UPDATE reply_jobs
       SET status = $1, retry_count = $2, error = $3, updated_at = $4
       WHERE id = $5`,
      [job.status, job.retryCount, job.error || null, job.updatedAt, job.id]
    );
  } catch (err) {
    console.warn('[Job Queue Postgres Update Notice]:', err);
  }
}
