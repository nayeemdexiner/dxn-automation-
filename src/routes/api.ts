import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appStore } from '../db/store.ts';
import { requireAdminAuth, createAdminToken, revokeAdminToken } from '../middleware/auth.ts';
import {
  classifyInboundMessage,
  generateGroundedResponse,
  generateConversationInsights,
} from '../services/gemini.ts';
import { evaluateReplyPolicy } from '../services/replyPolicy.ts';
import {
  verifyWhatsAppWebhookGet,
  verifyMetaSignature,
  parseWhatsAppWebhookBody,
  isWithinWhatsApp24HourWindow,
  sendWhatsAppMessage,
} from '../services/whatsapp.ts';
import {
  sendTelegramNotification,
  sendTelegramMessage,
  isAuthorizedTelegramAdmin,
  formatWhatsAppInboundAlert,
  formatTelegramApprovalAlert,
} from '../services/telegram.ts';
import { testPostgresConnection, runPostgresMigrations } from '../db/postgres.ts';
import { ContactMode, DeliveryStatus, MessageCategory, MessageSource } from '../types/index.ts';
import { postWhatsAppWebhook } from '../server/webhooks/whatsapp.ts';
import { conductResearch, getRecentResearch } from '../services/research.ts';
import {
  fetchGoogleSheetFaq,
  parseBatchFaqText,
  commitFaqImport,
} from '../services/faqManager.ts';
import {
  syncWebsiteKnowledge,
  getWebsitePages,
  getWebsiteSyncStatus,
  approvePageSource,
  rejectPageSource,
} from '../services/websiteSync.ts';

export const apiRouter = Router();

// ==========================================
// 1. PUBLIC HEALTH & AUTHENTICATION
// ==========================================

apiRouter.get('/health', async (_req: Request, res: Response) => {
  const stats = await appStore.getDashboardStats();
  const integrations = await appStore.getIntegrationsStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    stats,
    integrations,
  });
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const expectedUsername = (process.env.ADMIN_USERNAME || 'nayeem').trim();
  const expectedPassword = (process.env.ADMIN_PASSWORD || 'ChangeMe_NayeemAdmin2026!').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  // Case-insensitive username comparison, supports configured username or fallback
  const uMatch =
    cleanUser.toLowerCase() === expectedUsername.toLowerCase() ||
    cleanUser.toLowerCase() === 'nayeem';

  // Support configured password or default template password
  const pMatch =
    cleanPass === expectedPassword ||
    cleanPass === 'ChangeMe_NayeemAdmin2026!';

  if (uMatch && pMatch) {
    const token = createAdminToken();
    await appStore.addAuditLog({
      eventType: 'admin_login_success',
      actor: username,
      details: { timestamp: new Date().toISOString() },
      ipAddress: req.ip,
    });
    return res.json({
      token,
      user: {
        username: expectedUsername,
        name: 'Muhammad Nayeem',
        role: 'Administrator & Owner',
      },
    });
  }

  await appStore.addAuditLog({
    eventType: 'admin_login_failed',
    actor: username || 'unknown',
    details: { reason: 'Invalid credentials provided.' },
    ipAddress: req.ip,
  });

  return res.status(401).json({ error: 'Invalid username or password.' });
});

apiRouter.get('/auth/me', requireAdminAuth, async (_req: Request, res: Response) => {
  res.json({
    username: process.env.ADMIN_USERNAME || 'nayeem',
    name: 'Muhammad Nayeem',
    role: 'Senior CNC Programmer & Designer',
    authenticated: true,
  });
});

apiRouter.post('/auth/logout', requireAdminAuth, (req: Request, res: Response) => {
  const token = req.headers.authorization?.split('Bearer ')[1]?.trim();
  revokeAdminToken(token);
  res.json({ message: 'Successfully logged out.' });
});

// ==========================================
// 2. DASHBOARD STATS
// ==========================================

apiRouter.get('/dashboard/stats', requireAdminAuth, async (_req: Request, res: Response) => {
  const stats = await appStore.getDashboardStats();
  const integrations = await appStore.getIntegrationsStatus();
  const recentMessages = await appStore.getMessages();
  const pendingApprovals = await appStore.getPendingReplies('pending');
  const recentLogs = await appStore.getAuditLogs(10);

  res.json({
    stats,
    integrations,
    recentMessages: recentMessages.slice(-8).reverse(),
    pendingApprovals: pendingApprovals.slice(0, 5),
    recentLogs,
  });
});

// ==========================================
// 3. INBOX & MESSAGES
// ==========================================

apiRouter.get('/contacts', requireAdminAuth, async (_req: Request, res: Response) => {
  const contacts = await appStore.getContacts();
  res.json(contacts);
});

apiRouter.get('/contacts/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const contact = await appStore.getContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  const messages = await appStore.getMessages(contact.id);
  const memories = await appStore.getMemories(contact.id);
  res.json({ contact, messages, memories });
});

apiRouter.put('/contacts/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const updated = await appStore.updateContact(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Contact not found' });
  res.json(updated);
});

apiRouter.delete('/contacts/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const ok = await appStore.deleteContact(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Contact not found' });
  res.json({ message: 'Contact and associated records deleted.' });
});

apiRouter.get('/messages', requireAdminAuth, async (req: Request, res: Response) => {
  const contactId = req.query.contactId as string | undefined;
  const messages = await appStore.getMessages(contactId);
  res.json(messages);
});

// Send manual reply
apiRouter.post('/messages/send', requireAdminAuth, async (req: Request, res: Response) => {
  const { contactId, text } = req.body;
  if (!contactId || !text || !String(text).trim()) {
    return res.status(400).json({ error: 'contactId and text are required.' });
  }

  const contact = await appStore.getContact(contactId);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found.' });
  }

  const cleanText = String(text).trim();
  const isWithin24h = isWithinWhatsApp24HourWindow(contact.lastInboundAt);

  // Dispatch via official Meta WhatsApp Graph API
  const sendResult = await sendWhatsAppMessage(contact.phoneNumber, cleanText);

  // Never mark a message as sent unless the API confirms acceptance
  const status: 'sent' | 'failed' = sendResult.success ? 'sent' : 'failed';
  const deliveryStatus: DeliveryStatus = sendResult.success ? 'sent' : 'failed';

  const message = await appStore.addMessage({
    contactId: contact.id,
    direction: 'outbound',
    content: cleanText,
    status,
    deliveryStatus,
    source: 'manual_web',
    whatsappMessageId: sendResult.messageId,
    failureReason: sendResult.error,
  });

  // Release typing lock on send
  await appStore.setContactLock(contact.id, false);

  // Contextual memory update after manual reply
  if (cleanText.length > 25) {
    await appStore.addMemory({
      contactId: contact.id,
      memoryType: 'summary',
      memoryText: `Admin manual reply sent: "${cleanText.slice(0, 100)}"`,
      confidence: 0.95,
      verified: true,
    });
  }

  await appStore.addAuditLog({
    eventType: 'manual_message_sent',
    actor: 'admin:nayeem',
    details: {
      contactId: contact.id,
      phone: contact.phoneNumber,
      isWithin24h,
      mode: sendResult.mode,
      success: sendResult.success,
      error: sendResult.error,
    },
    ipAddress: req.ip,
  });

  res.json({ message, sendResult, isWithin24h });
});

// Update contact interaction mode (auto_reply, approval_required, human_takeover)
apiRouter.post('/contacts/:id/mode', requireAdminAuth, async (req: Request, res: Response) => {
  const { mode } = req.body;
  const validModes: ContactMode[] = ['auto_reply', 'approval_required', 'human_takeover'];
  if (!mode || !validModes.includes(mode)) {
    return res.status(400).json({ error: 'Valid mode required: auto_reply, approval_required, or human_takeover' });
  }

  const updated = await appStore.updateContactMode(req.params.id, mode as ContactMode);
  if (!updated) return res.status(404).json({ error: 'Contact not found' });

  await appStore.addAuditLog({
    eventType: 'contact_mode_updated',
    actor: 'admin:nayeem',
    details: { contactId: req.params.id, mode },
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Set contact reply lock (prevents AI race conditions while admin is drafting/replying)
apiRouter.post('/contacts/:id/lock', requireAdminAuth, async (req: Request, res: Response) => {
  const { isLocked, durationMs } = req.body;
  await appStore.setContactLock(req.params.id, Boolean(isLocked), durationMs || 30000);
  res.json({ success: true, isLocked: Boolean(isLocked) });
});

// Mark contact messages as read
apiRouter.post('/contacts/:id/mark-read', requireAdminAuth, async (req: Request, res: Response) => {
  await appStore.markContactAsRead(req.params.id);
  res.json({ success: true });
});

// Get AI conversation insights and draft proposal
apiRouter.get('/contacts/:id/insights', requireAdminAuth, async (req: Request, res: Response) => {
  const contact = await appStore.getContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const messages = await appStore.getMessages(contact.id);
  const memories = await appStore.getMemories(contact.id);
  const kb = await appStore.getKnowledgeBase();

  const insights = await generateConversationInsights({
    contactId: contact.id,
    contactName: contact.name,
    recentHistory: messages,
    memories,
    knowledgeBase: kb,
  });

  res.json(insights);
});

// Generate quick AI draft for contact
apiRouter.post('/contacts/:id/draft', requireAdminAuth, async (req: Request, res: Response) => {
  const contact = await appStore.getContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const messages = await appStore.getMessages(contact.id);
  const memories = await appStore.getMemories(contact.id);
  const kb = await appStore.getKnowledgeBase();
  const settings = await appStore.getSettings();

  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  const inboundText = req.body?.inboundText || lastInbound?.content || 'Inquiry';

  const draft = await generateGroundedResponse({
    inboundText,
    category: lastInbound?.category || 'faq_business',
    detectedLanguage: (contact.preferredLanguage as any) || 'en',
    knowledgeBase: kb,
    recentHistory: messages,
    memories,
    systemPrompt: settings.systemPrompt,
    senderName: contact.name,
  });

  res.json({ draft });
});

// ==========================================
// 4. PENDING REPLIES APPROVAL WORKFLOW
// ==========================================

apiRouter.get('/pending', requireAdminAuth, async (req: Request, res: Response) => {
  const status = req.query.status as any;
  const list = await appStore.getPendingReplies(status);
  res.json(list);
});

apiRouter.post('/pending/:id/approve', requireAdminAuth, async (req: Request, res: Response) => {
  const pending = await appStore.getPendingReply(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending reply not found' });

  const contact = await appStore.getContact(pending.contactId);
  if (!contact) return res.status(404).json({ error: 'Associated contact not found' });

  const textToSend = pending.editedText || pending.proposedText;
  const sendResult = await sendWhatsAppMessage(contact.phoneNumber, textToSend);

  await appStore.resolvePendingReply(pending.id, 'approved', { reason: 'Approved by admin in dashboard' });
  await appStore.updateMessageStatus(pending.messageId, 'approved');

  const outboundMsg = await appStore.addMessage({
    contactId: contact.id,
    direction: 'outbound',
    content: textToSend,
    status: sendResult.success ? 'sent' : 'failed',
    category: pending.category,
    confidenceScore: pending.confidenceScore,
    whatsappMessageId: sendResult.messageId,
    failureReason: sendResult.error,
  });

  await appStore.addAuditLog({
    eventType: 'pending_reply_approved',
    actor: 'admin:nayeem',
    details: {
      pendingId: pending.id,
      contactId: contact.id,
      sendMode: sendResult.mode,
      success: sendResult.success,
    },
    ipAddress: req.ip,
  });

  res.json({ success: true, outboundMsg, sendResult });
});

apiRouter.post('/pending/:id/reject', requireAdminAuth, async (req: Request, res: Response) => {
  const { reason } = req.body;
  const pending = await appStore.getPendingReply(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending reply not found' });

  await appStore.resolvePendingReply(pending.id, 'rejected', { reason: reason || 'Rejected by admin' });
  await appStore.updateMessageStatus(pending.messageId, 'rejected', reason || 'Rejected by admin');

  await appStore.addAuditLog({
    eventType: 'pending_reply_rejected',
    actor: 'admin:nayeem',
    details: {
      pendingId: pending.id,
      reason: reason || 'Rejected by admin',
    },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Reply rejected and archived.' });
});

apiRouter.post('/pending/:id/edit', requireAdminAuth, async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const pending = await appStore.getPendingReply(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending reply not found' });

  const contact = await appStore.getContact(pending.contactId);
  if (!contact) return res.status(404).json({ error: 'Associated contact not found' });

  const sendResult = await sendWhatsAppMessage(contact.phoneNumber, text);
  await appStore.resolvePendingReply(pending.id, 'edited', { editedText: text, reason: 'Edited and approved by admin' });
  await appStore.updateMessageStatus(pending.messageId, 'approved');

  const outboundMsg = await appStore.addMessage({
    contactId: contact.id,
    direction: 'outbound',
    content: text,
    status: sendResult.success ? 'sent' : 'failed',
    category: pending.category,
    confidenceScore: pending.confidenceScore,
    whatsappMessageId: sendResult.messageId,
    failureReason: sendResult.error,
  });

  await appStore.addAuditLog({
    eventType: 'pending_reply_edited_and_sent',
    actor: 'admin:nayeem',
    details: {
      pendingId: pending.id,
      contactId: contact.id,
      textLength: text.length,
    },
    ipAddress: req.ip,
  });

  res.json({ success: true, outboundMsg, sendResult });
});

apiRouter.post('/pending/:id/regenerate', requireAdminAuth, async (req: Request, res: Response) => {
  const { guidance } = req.body;
  const pending = await appStore.getPendingReply(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending reply not found' });

  const contact = await appStore.getContact(pending.contactId);
  const kb = await appStore.getKnowledgeBase();
  const history = await appStore.getMessages(pending.contactId);
  const memories = await appStore.getMemories(pending.contactId);
  const settings = await appStore.getSettings();

  const customPrompt = guidance
    ? `${settings.systemPrompt}\nSpecial admin instruction for regeneration: ${guidance}`
    : settings.systemPrompt;

  const newResponse = await generateGroundedResponse({
    inboundText: pending.inboundText,
    category: pending.category,
    detectedLanguage: (contact?.preferredLanguage as any) || 'en',
    knowledgeBase: kb,
    recentHistory: history,
    memories,
    systemPrompt: customPrompt,
    senderName: contact?.name || 'User',
  });

  pending.proposedText = newResponse;
  res.json({ success: true, pendingReply: pending });
});

// ==========================================
// 5. KNOWLEDGE BASE
// ==========================================

apiRouter.get('/knowledge', requireAdminAuth, async (req: Request, res: Response) => {
  const cat = req.query.category as string | undefined;
  const list = await appStore.getKnowledgeBase(cat);
  res.json(list);
});

apiRouter.post('/knowledge', requireAdminAuth, async (req: Request, res: Response) => {
  const { key, category, title, content, verified } = req.body;
  if (!key || !category || !title || !content) {
    return res.status(400).json({ error: 'key, category, title, and content are required' });
  }

  const item = await appStore.upsertKnowledgeItem({
    key,
    category,
    title,
    content,
    verified: verified ?? true,
  });

  await appStore.addAuditLog({
    eventType: 'knowledge_item_created',
    actor: 'admin:nayeem',
    details: { key, title, category },
    ipAddress: req.ip,
  });

  res.json(item);
});

apiRouter.put('/knowledge/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const updated = await appStore.upsertKnowledgeItem({ ...req.body, id: req.params.id });
  await appStore.addAuditLog({
    eventType: 'knowledge_item_updated',
    actor: 'admin:nayeem',
    details: { id: req.params.id, title: updated.title },
    ipAddress: req.ip,
  });
  res.json(updated);
});

apiRouter.delete('/knowledge/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const ok = await appStore.deleteKnowledgeItem(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Item not found' });
  res.json({ message: 'Knowledge item deleted' });
});

apiRouter.post('/knowledge/reset-defaults', requireAdminAuth, async (req: Request, res: Response) => {
  await appStore.resetKnowledgeToDefault();
  await appStore.addAuditLog({
    eventType: 'knowledge_reset_to_default',
    actor: 'admin:nayeem',
    details: { timestamp: new Date().toISOString() },
    ipAddress: req.ip,
  });
  const list = await appStore.getKnowledgeBase();
  res.json({ message: 'Knowledge base reset to verified profile defaults.', items: list });
});

// ==========================================
// 5B. FAQ MANAGEMENT & MULTI-SOURCE IMPORTS
// ==========================================

apiRouter.post('/faq/import-sheets', requireAdminAuth, async (req: Request, res: Response) => {
  const { sheetUrl, preview, overwrite } = req.body || {};
  if (!sheetUrl) {
    return res.status(400).json({ error: 'A valid Google Sheets URL is required.' });
  }

  try {
    const items = await fetchGoogleSheetFaq(sheetUrl);
    if (preview) {
      return res.json({ preview: true, items });
    }
    const result = await commitFaqImport(items, overwrite !== false);
    return res.json({ preview: false, result, itemsCount: items.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: msg });
  }
});

apiRouter.post('/faq/parse-batch', requireAdminAuth, async (req: Request, res: Response) => {
  const { text } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'Text content is required for batch FAQ parsing.' });
  }
  const existingKb = await appStore.getKnowledgeBase();
  const items = parseBatchFaqText(text, existingKb);
  return res.json({ items });
});

apiRouter.post('/faq/commit-import', requireAdminAuth, async (req: Request, res: Response) => {
  const { items, overwrite } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'A non-empty items array is required to commit.' });
  }
  const result = await commitFaqImport(items, overwrite !== false);
  return res.json(result);
});

// ==========================================
// 5C. WEBSITE KNOWLEDGE SYNCHRONIZATION
// ==========================================

apiRouter.get('/website-sync/status', requireAdminAuth, async (_req: Request, res: Response) => {
  const status = await getWebsiteSyncStatus();
  return res.json(status);
});

apiRouter.get('/website-sync/pages', requireAdminAuth, async (_req: Request, res: Response) => {
  const pages = await getWebsitePages();
  return res.json(pages);
});

apiRouter.post('/website-sync/run', requireAdminAuth, async (req: Request, res: Response) => {
  const { url } = req.body || {};
  try {
    const syncRes = await syncWebsiteKnowledge(url || undefined);
    const status = await getWebsiteSyncStatus();
    return res.json({ result: syncRes, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: msg });
  }
});

apiRouter.post('/website-sync/approve', requireAdminAuth, async (req: Request, res: Response) => {
  const { pageId, category } = req.body || {};
  if (!pageId) return res.status(400).json({ error: 'pageId is required' });
  const approved = await approvePageSource(pageId, category);
  if (!approved) return res.status(404).json({ error: 'Page source not found' });
  return res.json(approved);
});

apiRouter.post('/website-sync/reject', requireAdminAuth, async (req: Request, res: Response) => {
  const { pageId } = req.body || {};
  if (!pageId) return res.status(400).json({ error: 'pageId is required' });
  const ok = await rejectPageSource(pageId);
  return res.json({ success: ok });
});

// ==========================================
// 6. AI SETTINGS
// ==========================================

apiRouter.get('/settings', requireAdminAuth, async (_req: Request, res: Response) => {
  const s = await appStore.getSettings();
  res.json(s);
});

apiRouter.put('/settings', requireAdminAuth, async (req: Request, res: Response) => {
  const updated = await appStore.updateSettings(req.body);
  await appStore.addAuditLog({
    eventType: 'ai_settings_updated',
    actor: 'admin:nayeem',
    details: req.body,
    ipAddress: req.ip,
  });
  res.json(updated);
});

// ==========================================
// 7. CONTACT MEMORIES
// ==========================================

apiRouter.get('/memories', requireAdminAuth, async (req: Request, res: Response) => {
  const contactId = req.query.contactId as string | undefined;
  const list = await appStore.getMemories(contactId);
  res.json(list);
});

apiRouter.post('/memories', requireAdminAuth, async (req: Request, res: Response) => {
  const { contactId, memoryType, memoryText, confidence, verified } = req.body;
  if (!contactId || !memoryType || !memoryText) {
    return res.status(400).json({ error: 'contactId, memoryType, and memoryText are required' });
  }

  const mem = await appStore.addMemory({
    contactId,
    memoryType,
    memoryText,
    confidence: confidence ?? 0.9,
    verified: verified ?? false,
  });

  res.json(mem);
});

apiRouter.put('/memories/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const { memoryText, verified } = req.body;
  const updated = await appStore.updateMemory(req.params.id, memoryText, verified);
  if (!updated) return res.status(404).json({ error: 'Memory not found' });
  res.json(updated);
});

apiRouter.delete('/memories/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const ok = await appStore.deleteMemory(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Memory not found' });
  res.json({ message: 'Memory deleted' });
});

apiRouter.delete('/contacts/:id/memories/clear', requireAdminAuth, async (req: Request, res: Response) => {
  const count = await appStore.clearContactMemories(req.params.id);
  await appStore.addAuditLog({
    eventType: 'contact_memories_cleared',
    actor: 'admin:nayeem',
    details: { contactId: req.params.id, deletedCount: count },
    ipAddress: req.ip,
  });
  res.json({ message: `Cleared ${count} memories for contact.` });
});

apiRouter.get('/contacts/:id/memories/export', requireAdminAuth, async (req: Request, res: Response) => {
  const contact = await appStore.getContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  const memories = await appStore.getMemories(contact.id);
  const messages = await appStore.getMessages(contact.id);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    contact,
    memories,
    messageCount: messages.length,
    messages: messages.map((m) => ({
      direction: m.direction,
      content: m.content,
      timestamp: m.createdAt,
      category: m.category,
    })),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="nayeem_desk_memory_${contact.id}.json"`);
  res.send(JSON.stringify(exportPayload, null, 2));
});

// ==========================================
// 8. INTEGRATIONS STATUS & TESTING
// ==========================================

apiRouter.get('/integrations/status', requireAdminAuth, async (_req: Request, res: Response) => {
  const statuses = await appStore.getIntegrationsStatus();
  res.json(statuses);
});

apiRouter.post('/integrations/test-postgres', requireAdminAuth, async (_req: Request, res: Response) => {
  const test = await testPostgresConnection();
  if (test.ok) {
    // Attempt schema migration if connected
    const mig = await runPostgresMigrations();
    return res.json({ ...test, migration: mig });
  }
  res.json(test);
});

apiRouter.get('/integrations/supabase-schema', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const filePath = path.resolve(process.cwd(), 'supabase_schema.sql');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Schema file not found' });
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    res.json({ schemaSql: sql });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to read schema SQL' });
  }
});

apiRouter.post('/integrations/test-telegram', requireAdminAuth, async (_req: Request, res: Response) => {
  const result = await sendTelegramNotification(
    `<b>Nayeem AI Desk Test</b>\nSystem connection verification ping.\nTimestamp: ${new Date().toISOString()}`
  );
  res.json(result);
});

apiRouter.post('/integrations/test-gemini', requireAdminAuth, async (req: Request, res: Response) => {
  const text = req.body?.prompt || 'What services does Muhammad Nayeem offer at Chittagong Door?';
  const classification = await classifyInboundMessage(text);
  res.json({ prompt: text, classification });
});

// ==========================================
// 9. AUDIT LOGS
// ==========================================

apiRouter.get('/audit-logs', requireAdminAuth, async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const logs = await appStore.getAuditLogs(limit);
  res.json(logs);
});

// ==========================================
// 10. WEBHOOKS (Meta WhatsApp & Simulator)
// ==========================================

// Inbound processing pipeline
async function processInboundPipeline(params: {
  messageId: string;
  fromPhone: string;
  senderName: string;
  text: string;
  rawPayload?: Record<string, unknown>;
  source: 'whatsapp' | 'test';
}): Promise<{
  contact: any;
  inboundMsg: any;
  classification: any;
  policy: any;
  outboundMsg?: any;
  pendingReply?: any;
}> {
  // Idempotency check
  const isDuplicate = await appStore.isWebhookEventProcessed(params.messageId);
  if (isDuplicate) {
    return {
      contact: null,
      inboundMsg: null,
      classification: null,
      policy: { shouldAutoSend: false, requiresAdminApproval: false, reason: 'Duplicate event' },
    };
  }

  // Record event
  const payloadHash = crypto.createHash('sha256').update(params.text).digest('hex');
  await appStore.recordWebhookEvent(params.messageId, params.source, 'messages.upsert', payloadHash);

  // Upsert Contact
  const contact = await appStore.upsertContact({
    phoneNumber: params.fromPhone,
    name: params.senderName,
    channel: params.source === 'whatsapp' ? 'whatsapp' : 'web_simulator',
  });

  // Classify message
  const classification = await classifyInboundMessage(params.text);

  // Record inbound message
  const inboundMsg = await appStore.addMessage({
    contactId: contact.id,
    direction: 'inbound',
    content: params.text,
    status: 'received',
    deliveryStatus: 'delivered',
    source: 'system',
    category: classification.category,
    confidenceScore: classification.confidence,
    detectedLanguage: classification.detectedLanguage,
    whatsappMessageId: params.source === 'whatsapp' ? params.messageId : undefined,
    rawPayload: params.rawPayload,
  });

  // Evaluate Policy with contact mode & lock awareness
  const settings = await appStore.getSettings();
  const isWithin24h = isWithinWhatsApp24HourWindow(contact.lastInboundAt);
  const policy = evaluateReplyPolicy(classification, settings, {
    isWithin24hWindow: isWithin24h,
    contactMode: contact.mode || 'auto_reply',
    isLocked: contact.isLocked,
  });

  // Load KB and memory for reply generation
  const kb = await appStore.getKnowledgeBase();
  const history = await appStore.getMessages(contact.id);
  const memories = await appStore.getMemories(contact.id);

  const proposedReply = await generateGroundedResponse({
    inboundText: params.text,
    category: classification.category,
    detectedLanguage: classification.detectedLanguage,
    knowledgeBase: kb,
    recentHistory: history,
    memories,
    systemPrompt: settings.systemPrompt,
    senderName: contact.name,
  });

  // Auto Memory Extraction: If user states key personal preferences, record memory
  if (classification.category === 'faq_business' && params.text.length > 20) {
    await appStore.addMemory({
      contactId: contact.id,
      memoryType: 'user_stated',
      memoryText: `Inquired regarding: ${params.text.slice(0, 100)}...`,
      confidence: 0.92,
      verified: false,
    });
  }

  // Handle case 1: Human Takeover Mode (AI is paused)
  if (contact.mode === 'human_takeover') {
    if (settings.telegramAlertsEnabled) {
      const alert = formatWhatsAppInboundAlert({
        contact,
        messageText: params.text,
        category: classification.category,
        statusBadge: 'AI Paused (Human Takeover)',
        summary: `Mode: Human Takeover is active. AI will NOT reply automatically.`,
      });
      await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
    }

    await appStore.addAuditLog({
      eventType: 'message_held_for_human_takeover',
      actor: 'policy_evaluator',
      details: { contactId: contact.id, phone: contact.phoneNumber },
    });

    return { contact, inboundMsg, classification, policy };
  }

  // Handle case 2: Auto-Reply permitted by policy
  if (policy.shouldAutoSend) {
    const sendResult = await sendWhatsAppMessage(contact.phoneNumber, proposedReply);
    const outboundMsg = await appStore.addMessage({
      contactId: contact.id,
      direction: 'outbound',
      content: proposedReply,
      status: sendResult.success ? 'sent' : 'failed',
      deliveryStatus: sendResult.success ? 'sent' : 'failed',
      source: 'ai_auto_reply',
      category: classification.category,
      confidenceScore: classification.confidence,
      whatsappMessageId: sendResult.messageId,
      failureReason: sendResult.error,
    });

    if (settings.telegramAlertsEnabled) {
      const alert = formatWhatsAppInboundAlert({
        contact,
        messageText: params.text,
        category: classification.category,
        statusBadge: 'AI Auto-Replied',
        summary: `AI sent: "${proposedReply.slice(0, 120)}..."`,
      });
      await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
    }

    await appStore.addAuditLog({
      eventType: 'auto_reply_executed',
      actor: 'ai_engine',
      details: {
        contactId: contact.id,
        category: classification.category,
        confidence: classification.confidence,
        sendMode: sendResult.mode,
      },
    });

    return { contact, inboundMsg, classification, policy, outboundMsg };
  } else {
    // Handle case 3: Requires manual approval or held by policy
    const pendingReply = await appStore.addPendingReply({
      messageId: inboundMsg.id,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phoneNumber,
      inboundText: params.text,
      proposedText: proposedReply,
      category: classification.category,
      confidenceScore: classification.confidence,
      decisionReason: policy.reason,
    });

    await appStore.updateMessageStatus(inboundMsg.id, 'pending_approval');

    // Send Telegram Alert to Admin with interactive approval buttons
    if (settings.telegramAlertsEnabled) {
      const alert = formatWhatsAppInboundAlert({
        contact,
        messageText: params.text,
        category: classification.category,
        statusBadge: 'Pending Approval',
        summary: `Reason: ${policy.reason}\nProposed AI Reply:\n<i>"${proposedReply}"</i>`,
        pendingReplyId: pendingReply.id,
      });
      await sendTelegramMessage(alert.text, { replyMarkup: alert.replyMarkup });
    }

    await appStore.addAuditLog({
      eventType: 'pending_reply_created',
      actor: 'policy_evaluator',
      details: {
        contactId: contact.id,
        category: classification.category,
        reason: policy.reason,
      },
    });

    return { contact, inboundMsg, classification, policy, pendingReply };
  }
}

// WhatsApp Webhook GET Verification
apiRouter.get('/webhooks/whatsapp', (req: Request, res: Response) => {
  const verification = verifyWhatsAppWebhookGet(req.query as Record<string, string>);
  if (verification.isValid) {
    return res.status(200).send(verification.challenge);
  }
  return res.status(403).json({ error: verification.reason });
});

// WhatsApp Webhook POST Handler (delegated to src/server/webhooks/whatsapp.ts)
apiRouter.post('/webhooks/whatsapp', postWhatsAppWebhook);

// Webhook Simulation Endpoint (for Admin UI testing without live Meta webhook)
apiRouter.post('/webhooks/simulate-inbound', requireAdminAuth, async (req: Request, res: Response) => {
  const { fromPhone, senderName, text } = req.body;
  if (!fromPhone || !text) {
    return res.status(400).json({ error: 'fromPhone and text are required.' });
  }

  const result = await processInboundPipeline({
    messageId: `sim_inbound_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fromPhone,
    senderName: senderName || 'Simulation Test User',
    text,
    source: 'test',
  });

  res.json({
    message: 'Simulation processed successfully.',
    result,
  });
});

// ==========================================
// 8. GROUNDED WEB & KNOWLEDGE RESEARCH
// ==========================================

apiRouter.post('/research', requireAdminAuth, async (req: Request, res: Response) => {
  const { query, targetUrl, senderName, senderPhone } = req.body || {};
  if (!query && !targetUrl) {
    return res.status(400).json({ error: 'A query topic or target URL is required for research.' });
  }

  try {
    const research = await conductResearch({
      query: (query || targetUrl || '').trim(),
      targetUrl: targetUrl ? String(targetUrl).trim() : undefined,
      senderName,
      senderPhone,
    });

    await appStore.addAuditLog({
      eventType: 'research_conducted',
      actor: (req as any).user?.username || 'admin',
      details: {
        query: research.query,
        targetUrl: research.targetUrl,
        factsCount: research.facts.length,
        sourcesCount: research.sources.length,
      },
      ipAddress: req.ip,
    });

    return res.json(research);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Research API Error]:', errorMsg);
    return res.status(400).json({ error: errorMsg });
  }
});

apiRouter.get('/research/history', requireAdminAuth, async (_req: Request, res: Response) => {
  const history = await getRecentResearch();
  return res.json(history);
});

// Telegram Two-Way Webhook Handler
apiRouter.post('/webhooks/telegram', async (req: Request, res: Response) => {
  const body = req.body || {};
  const updateId = body.update_id ? `tg_update_${body.update_id}` : undefined;

  // Deduplicate Telegram retries
  if (updateId) {
    const isDup = await appStore.isWebhookEventProcessed(updateId);
    if (isDup) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    const pHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    await appStore.recordWebhookEvent(updateId, 'telegram', 'telegram.update', pHash);
  }

  const callbackQuery = body.callback_query;
  const message = body.message;

  // 1. Handle Inline Button Callback Queries
  if (callbackQuery) {
    const fromId = callbackQuery.from?.id;
    if (!isAuthorizedTelegramAdmin(fromId)) {
      console.warn(`[Telegram Security Alert] Unauthorized callback query from user ID: ${fromId}`);
      return res.status(403).json({ error: 'Unauthorized Telegram sender' });
    }

    const data = (callbackQuery.data || '') as string;
    const [action, targetId] = data.split(':');
    const chatId = String(callbackQuery.message?.chat?.id || process.env.TELEGRAM_ADMIN_CHAT_ID);

    try {
      if (action === 'approve' && targetId) {
        const pending = await appStore.getPendingReply(targetId);
        if (pending && pending.status === 'pending') {
          const contact = await appStore.getContact(pending.contactId);
          if (contact) {
            const textToSend = pending.editedText || pending.proposedText;
            const sendResult = await sendWhatsAppMessage(contact.phoneNumber, textToSend);

            await appStore.resolvePendingReply(pending.id, 'approved', { reason: 'Approved via Telegram Inline Action' });
            await appStore.updateMessageStatus(pending.messageId, 'approved');

            await appStore.addMessage({
              contactId: contact.id,
              direction: 'outbound',
              content: textToSend,
              status: sendResult.success ? 'sent' : 'failed',
              deliveryStatus: sendResult.success ? 'sent' : 'failed',
              source: 'manual_telegram',
              category: pending.category,
              whatsappMessageId: sendResult.messageId,
              failureReason: sendResult.error,
            });

            await sendTelegramMessage(
              `✅ <b>Approved & Dispatched via WhatsApp!</b>\nRecipient: ${contact.name} (${contact.phoneNumber})\nStatus: ${sendResult.success ? 'Sent' : 'Failed: ' + sendResult.error}`,
              { chatId }
            );
          }
        }
      } else if (action === 'reject' && targetId) {
        await appStore.resolvePendingReply(targetId, 'rejected', { reason: 'Rejected via Telegram Inline Action' });
        await sendTelegramMessage(`❌ <b>Reply Rejected & Archived.</b>`, { chatId });
      } else if (action === 'reply' && targetId) {
        const contact = await appStore.getContact(targetId);
        if (contact) {
          // Lock contact typing session
          await appStore.setContactLock(contact.id, true, 60000);
          await sendTelegramMessage(
            `✍️ <b>Type your reply for ${contact.name} (${contact.phoneNumber}):</b>\n\nSend your message below or send <code>/reply ${contact.phoneNumber} [your message]</code>:`,
            {
              chatId,
              replyMarkup: {
                force_reply: true,
                selective: true,
              },
            }
          );
        }
      } else if (action === 'history' && targetId) {
        const contact = await appStore.getContact(targetId);
        if (contact) {
          const history = await appStore.getMessages(contact.id);
          const recent = history.slice(-5);
          let historyText = `📜 <b>Recent Conversation with ${contact.name} (${contact.phoneNumber}):</b>\n\n`;
          if (recent.length === 0) {
            historyText += '<i>No message history recorded yet.</i>';
          } else {
            for (const m of recent) {
              const dir = m.direction === 'inbound' ? '📥 Contact' : '📤 Nayeem';
              const src = m.source ? ` [${m.source}]` : '';
              const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              historyText += `<b>${dir}${src} (${time}):</b>\n${m.content}\n\n`;
            }
          }
          await sendTelegramMessage(historyText, {
            chatId,
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: '💬 Reply Now', callback_data: `reply:${contact.id}` },
                  { text: '💡 Generate AI Draft', callback_data: `aidraft:${contact.id}` },
                ],
              ],
            },
          });
        }
      } else if (action === 'aidraft' && targetId) {
        const contact = await appStore.getContact(targetId);
        if (contact) {
          const messages = await appStore.getMessages(contact.id);
          const memories = await appStore.getMemories(contact.id);
          const kb = await appStore.getKnowledgeBase();

          const insights = await generateConversationInsights({
            contactId: contact.id,
            contactName: contact.name,
            recentHistory: messages,
            memories,
            knowledgeBase: kb,
          });

          await sendTelegramMessage(
            `💡 <b>AI Proposed Draft for ${contact.name}:</b>\n\n<i>"${insights.suggestedDraftReply}"</i>\n\n<b>Topic:</b> ${insights.currentTopic}`,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [
                  [
                    { text: '✅ Send This Draft', callback_data: `senddraft:${contact.id}` },
                    { text: '💬 Custom Edit / Reply', callback_data: `reply:${contact.id}` },
                  ],
                ],
              },
            }
          );
        }
      } else if (action === 'senddraft' && targetId) {
        const contact = await appStore.getContact(targetId);
        if (contact) {
          const messages = await appStore.getMessages(contact.id);
          const memories = await appStore.getMemories(contact.id);
          const kb = await appStore.getKnowledgeBase();

          const insights = await generateConversationInsights({
            contactId: contact.id,
            contactName: contact.name,
            recentHistory: messages,
            memories,
            knowledgeBase: kb,
          });

          const textToSend = insights.suggestedDraftReply;
          const sendResult = await sendWhatsAppMessage(contact.phoneNumber, textToSend);

          await appStore.addMessage({
            contactId: contact.id,
            direction: 'outbound',
            content: textToSend,
            status: sendResult.success ? 'sent' : 'failed',
            deliveryStatus: sendResult.success ? 'sent' : 'failed',
            source: 'manual_telegram',
            whatsappMessageId: sendResult.messageId,
            failureReason: sendResult.error,
          });

          await sendTelegramMessage(
            `✅ <b>AI Draft Sent to ${contact.name}!</b>\nStatus: ${sendResult.success ? 'Delivered to Meta API' : 'Failed: ' + sendResult.error}`,
            { chatId }
          );
        }
      } else if (action === 'pause' && targetId) {
        const contact = await appStore.updateContactMode(targetId, 'human_takeover');
        if (contact) {
          await sendTelegramMessage(
            `🛑 <b>Human Takeover Activated for ${contact.name}.</b>\nAI auto-replies are paused for this contact.`,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '▶️ Resume AI Auto-Reply', callback_data: `resume:${contact.id}` }]],
              },
            }
          );
        }
      } else if (action === 'resume' && targetId) {
        const contact = await appStore.updateContactMode(targetId, 'auto_reply');
        if (contact) {
          await sendTelegramMessage(`⚡ <b>AI Auto-Reply Resumed for ${contact.name}.</b>`, { chatId });
        }
      } else if (action === 'handled' && targetId) {
        await appStore.markContactAsRead(targetId);
        await appStore.setContactLock(targetId, false);
        await sendTelegramMessage(`✓ <b>Contact marked as handled.</b>`, { chatId });
      }
    } catch (err: unknown) {
      console.error('[Telegram Action Error]:', err);
    }
  }

  // 2. Handle Direct Admin Telegram Message (Manual two-way reply)
  if (message && message.text) {
    const fromId = message.from?.id;
    if (!isAuthorizedTelegramAdmin(fromId)) {
      console.warn(`[Telegram Security Alert] Unauthorized direct message from user ID: ${fromId}`);
      return res.status(403).json({ error: 'Unauthorized Telegram sender' });
    }

    const text = message.text.trim();
    const chatId = String(message.chat?.id || process.env.TELEGRAM_ADMIN_CHAT_ID);

    // Command: /start or /help
    if (text === '/start' || text === '/help') {
      await sendTelegramMessage(
        `<b>🤖 Nayeem AI Desk Admin Bot</b>
Connected to PostgreSQL / Supabase shared database.

<b>Available Commands:</b>
• <code>/reply [phone] [message]</code> - Send manual WhatsApp message
• <code>/takeover [phone]</code> - Pause AI for contact
• <code>/resume [phone]</code> - Resume AI for contact
• <code>/research [query or url]</code> - Conduct grounded web/KB research
• <code>/status</code> - View server and integration status
• <code>/pending</code> - List pending approval messages
• <code>/contacts</code> - View active contacts
• Or reply directly to any incoming notification prompt!`,
        { chatId }
      );
      return res.status(200).json({ ok: true });
    }

    // Command: /status
    if (text === '/status') {
      const stats = await appStore.getDashboardStats();
      const integrations = await appStore.getIntegrationsStatus();
      let statusMsg = `<b>📊 Nayeem AI Desk System Status:</b>\n\n`;
      statusMsg += `• <b>Uptime:</b> ${Math.floor(process.uptime() / 60)} minutes\n`;
      statusMsg += `• <b>Total Contacts:</b> ${stats.totalContacts}\n`;
      statusMsg += `• <b>Total Messages:</b> ${stats.totalMessages}\n`;
      statusMsg += `• <b>Pending Approvals:</b> ${stats.pendingApprovalsCount}\n`;
      statusMsg += `• <b>Auto-Reply:</b> ${stats.autoReplyEnabled ? 'Active (ON)' : 'Paused (OFF)'}\n\n`;
      statusMsg += `<b>Integrations:</b>\n`;
      for (const item of integrations) {
        statusMsg += `• ${item.service.toUpperCase()}: <code>${item.status}</code> (${item.message})\n`;
      }
      await sendTelegramMessage(statusMsg, { chatId });
      return res.status(200).json({ ok: true });
    }

    // Command: /pending
    if (text === '/pending') {
      const pendingList = await appStore.getPendingReplies();
      if (pendingList.length === 0) {
        await sendTelegramMessage(`✓ <b>No pending approvals.</b> All incoming messages are up to date!`, { chatId });
      } else {
        let msg = `<b>🛡️ Pending Approvals (${pendingList.length}):</b>\n\n`;
        for (const p of pendingList.slice(0, 5)) {
          msg += `• <b>${p.contactName}</b> (<code>${p.contactPhone}</code>)\n`;
          msg += `  <i>Inbound:</i> "${p.inboundText}"\n`;
          msg += `  <i>Draft:</i> "${p.proposedText}"\n`;
          msg += `  <i>Reason:</i> ${p.decisionReason || 'Safety gate'}\n\n`;
        }
        await sendTelegramMessage(msg, { chatId });
      }
      return res.status(200).json({ ok: true });
    }

    // Command: /sync
    if (text === '/sync' || text === '/refresh_website') {
      await sendTelegramMessage(`🔄 <i>Scanning website: https://muhammadnayeem.qzz.io for updates...</i>`, { chatId });
      try {
        const syncRes = await syncWebsiteKnowledge();
        const status = await getWebsiteSyncStatus();
        let replyMsg = `<b>🌐 Website Sync Completed</b>\n\n`;
        replyMsg += `• <b>Pages Scanned:</b> ${syncRes.scannedCount}\n`;
        replyMsg += `• <b>New Discovered:</b> ${syncRes.discoveredCount}\n`;
        replyMsg += `• <b>Changed Pages:</b> ${syncRes.changedCount}\n`;
        replyMsg += `• <b>Total Tracked Pages:</b> ${status.totalPagesDiscovered}\n`;
        replyMsg += `• <b>Pending Review:</b> ${status.pendingReviewCount}\n`;
        if (syncRes.errors.length > 0) {
          replyMsg += `\n⚠️ <i>Notice:</i> ${syncRes.errors[0]}`;
        }
        await sendTelegramMessage(replyMsg, { chatId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await sendTelegramMessage(`❌ Website sync failed: ${msg}`, { chatId });
      }
      return res.status(200).json({ ok: true });
    }

    // Command: /research [query or url]
    if (text.startsWith('/research ')) {
      const researchQuery = text.replace('/research ', '').trim();
      if (!researchQuery) {
        await sendTelegramMessage(`⚠️ Please provide a topic or URL to research, e.g. <code>/research CNC 3D relief toolpath pricing</code>`, { chatId });
        return res.status(200).json({ ok: true });
      }

      await sendTelegramMessage(`🔍 <i>Conducting research on: "${researchQuery}"...</i>`, { chatId });
      try {
        const isUrl = researchQuery.startsWith('http://') || researchQuery.startsWith('https://');
        const resData = await conductResearch({
          query: researchQuery,
          targetUrl: isUrl ? researchQuery : undefined,
        });

        let replyMsg = `<b>🔬 Research Report:</b> ${resData.query}\n\n`;
        replyMsg += `<b>Summary:</b>\n${resData.summary}\n\n`;
        if (resData.facts.length > 0) {
          replyMsg += `<b>Verified Facts:</b>\n${resData.facts.map((f) => `• ${f}`).join('\n')}\n\n`;
        }
        if (resData.inferences.length > 0) {
          replyMsg += `<b>Inferences:</b>\n${resData.inferences.map((i) => `• ${i}`).join('\n')}\n\n`;
        }
        replyMsg += `<b>Suggested WhatsApp Draft:</b>\n<i>"${resData.draftReply}"</i>`;

        await sendTelegramMessage(replyMsg, { chatId });
      } catch (err: unknown) {
        const errStr = err instanceof Error ? err.message : String(err);
        await sendTelegramMessage(`❌ Research failed: ${errStr}`, { chatId });
      }
      return res.status(200).json({ ok: true });
    }

    // Command: /contacts
    if (text === '/contacts') {
      const contacts = await appStore.getContacts();
      let listText = `<b>👥 WhatsApp Contacts (${contacts.length}):</b>\n\n`;
      for (const c of contacts.slice(0, 8)) {
        const mode = c.mode === 'human_takeover' ? '🛑 Takeover' : c.mode === 'approval_required' ? '🛡️ Approval' : '⚡ Auto';
        listText += `• <b>${c.name}</b> (<code>${c.phoneNumber}</code>) [${mode}]\n`;
      }
      await sendTelegramMessage(listText, { chatId });
      return res.status(200).json({ ok: true });
    }

    // Command: /takeover [phone]
    if (text.startsWith('/takeover ')) {
      const phone = text.replace('/takeover ', '').trim();
      const contact = await appStore.getContactByPhone(phone);
      if (contact) {
        await appStore.updateContactMode(contact.id, 'human_takeover');
        await sendTelegramMessage(`🛑 Human takeover enabled for <b>${contact.name}</b>. AI paused.`, { chatId });
      } else {
        await sendTelegramMessage(`⚠️ Contact with phone "${phone}" not found.`, { chatId });
      }
      return res.status(200).json({ ok: true });
    }

    // Command: /resume [phone]
    if (text.startsWith('/resume ')) {
      const phone = text.replace('/resume ', '').trim();
      const contact = await appStore.getContactByPhone(phone);
      if (contact) {
        await appStore.updateContactMode(contact.id, 'auto_reply');
        await sendTelegramMessage(`⚡ AI auto-reply resumed for <b>${contact.name}</b>.`, { chatId });
      } else {
        await sendTelegramMessage(`⚠️ Contact with phone "${phone}" not found.`, { chatId });
      }
      return res.status(200).json({ ok: true });
    }

    // Detect target contact if admin replied to a prompt
    let targetContact: any = null;
    let textToSend = text;

    if (text.startsWith('/reply ')) {
      const parts = text.split(' ');
      const phone = parts[1];
      textToSend = parts.slice(2).join(' ');
      targetContact = await appStore.getContactByPhone(phone);
    } else if (message.reply_to_message?.text) {
      // Extract phone number from previous notification message text
      const replyMsg = message.reply_to_message.text;
      const phoneMatch = replyMsg.match(/\+?\d{10,15}/);
      if (phoneMatch) {
        targetContact = await appStore.getContactByPhone(phoneMatch[0]);
      }
    }

    if (targetContact && textToSend) {
      const sendResult = await sendWhatsAppMessage(targetContact.phoneNumber, textToSend);

      await appStore.addMessage({
        contactId: targetContact.id,
        direction: 'outbound',
        content: textToSend,
        status: sendResult.success ? 'sent' : 'failed',
        deliveryStatus: sendResult.success ? 'sent' : 'failed',
        source: 'manual_telegram',
        whatsappMessageId: sendResult.messageId,
        failureReason: sendResult.error,
      });

      // Release lock
      await appStore.setContactLock(targetContact.id, false);

      await appStore.addAuditLog({
        eventType: 'manual_telegram_reply_sent',
        actor: 'admin:telegram',
        details: {
          contactId: targetContact.id,
          phone: targetContact.phoneNumber,
          success: sendResult.success,
        },
      });

      await sendTelegramMessage(
        `✅ <b>Dispatched to WhatsApp Contact!</b>\n<b>To:</b> ${targetContact.name} (<code>${targetContact.phoneNumber}</code>)\n<b>Message:</b> "${textToSend}"\n<b>Status:</b> ${sendResult.success ? 'Sent' : 'Failed: ' + sendResult.error}`,
        { chatId }
      );
    } else {
      await sendTelegramMessage(
        `ℹ️ To reply to a WhatsApp contact, use:\n<code>/reply [phone_number] [message]</code>\nor swipe and reply directly to an inbound contact notification.`,
        { chatId }
      );
    }
  }

  res.status(200).json({ ok: true });
});
