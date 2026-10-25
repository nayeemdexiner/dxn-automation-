import { PendingReply, Message, Contact } from '../types/index.ts';

export function isAuthorizedTelegramAdmin(fromId?: string | number): boolean {
  if (!fromId) return false;
  const adminId = (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
  const additionalAdmins = (process.env.TELEGRAM_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const cleanFrom = String(fromId).trim();
  if (!cleanFrom) return false;

  if (adminId && cleanFrom === adminId) return true;
  if (additionalAdmins.includes(cleanFrom)) return true;

  // In test/mock mode if no admin is set yet, log warning and allow for local test only if explicit
  if (!adminId && additionalAdmins.length === 0) {
    return false;
  }

  return false;
}

export async function sendTelegramMessage(
  text: string,
  options?: {
    chatId?: string;
    replyMarkup?: Record<string, any>;
    parseMode?: 'HTML' | 'MarkdownV2';
  }
): Promise<{ success: boolean; mode: 'real' | 'simulated'; error?: string; messageId?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = options?.chatId || process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (
    !token ||
    !targetChatId ||
    token === 'your_telegram_bot_token' ||
    targetChatId === 'your_telegram_admin_chat_id'
  ) {
    return {
      success: true,
      mode: 'simulated',
      error: 'Telegram credentials not configured in environment. Notification logged in test mode.',
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: options?.parseMode || 'HTML',
        reply_markup: options?.replyMarkup,
      }),
      signal: AbortSignal.timeout(7000),
    });

    const data = await res.json() as Record<string, any>;
    if (!res.ok || !data.ok) {
      console.warn('[Telegram API Error]:', data.description || 'Unknown error');
      return {
        success: false,
        mode: 'real',
        error: data.description || 'Telegram sendMessage failed',
      };
    }

    return {
      success: true,
      mode: 'real',
      messageId: data.result?.message_id,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Telegram API Network Error]:', msg);
    return { success: false, mode: 'real', error: msg };
  }
}

export async function sendTelegramNotification(
  text: string,
  options?: {
    pendingReply?: PendingReply;
    contactId?: string;
    replyMarkup?: Record<string, any>;
  }
): Promise<{ success: boolean; mode: 'real' | 'simulated'; error?: string }> {
  let markup = options?.replyMarkup;

  if (!markup && options?.pendingReply) {
    const p = options.pendingReply;
    markup = {
      inline_keyboard: [
        [
          { text: '✅ Approve & Send', callback_data: `approve:${p.id}` },
          { text: '❌ Reject', callback_data: `reject:${p.id}` },
        ],
        [
          { text: '💬 Manual Reply', callback_data: `reply:${p.contactId}` },
          { text: '📜 View History', callback_data: `history:${p.contactId}` },
        ],
        [
          { text: '🛑 Takeover (Pause AI)', callback_data: `pause:${p.contactId}` },
          { text: '▶️ Resume AI', callback_data: `resume:${p.contactId}` },
        ],
      ],
    };
  }

  return sendTelegramMessage(text, { replyMarkup: markup });
}

export function formatWhatsAppInboundAlert(params: {
  contact: Contact;
  messageText: string;
  category?: string;
  statusBadge: string;
  summary?: string;
  pendingReplyId?: string;
}): { text: string; replyMarkup: Record<string, any> } {
  const { contact, messageText, category, statusBadge, summary, pendingReplyId } = params;

  const modeBadge =
    contact.mode === 'human_takeover'
      ? '🛑 HUMAN TAKEOVER (AI Paused)'
      : contact.mode === 'approval_required'
      ? '🛡️ APPROVAL REQUIRED'
      : '⚡ AUTO REPLY ACTIVE';

  const text = `<b>📥 New WhatsApp Message</b>
<b>Contact:</b> ${contact.name} (<code>${contact.phoneNumber}</code>)
<b>Mode:</b> ${modeBadge}
<b>Classification:</b> <code>${category || 'general'}</code> · <i>${statusBadge}</i>

<b>Message:</b>
<i>"${messageText}"</i>
${summary ? `\n<b>Context Summary:</b>\n${summary}\n` : ''}
<i>Reply directly via Telegram or select an action below:</i>`;

  const inlineKeyboard: any[][] = [];

  if (pendingReplyId) {
    inlineKeyboard.push([
      { text: '✅ Approve & Send', callback_data: `approve:${pendingReplyId}` },
      { text: '❌ Reject', callback_data: `reject:${pendingReplyId}` },
    ]);
  }

  inlineKeyboard.push([
    { text: '💬 Reply', callback_data: `reply:${contact.id}` },
    { text: '📜 History', callback_data: `history:${contact.id}` },
    { text: '💡 AI Draft', callback_data: `aidraft:${contact.id}` },
  ]);

  inlineKeyboard.push([
    contact.mode === 'human_takeover'
      ? { text: '▶️ Resume AI Auto-Reply', callback_data: `resume:${contact.id}` }
      : { text: '🛑 Pause AI (Takeover)', callback_data: `pause:${contact.id}` },
    { text: '✓ Mark Handled', callback_data: `handled:${contact.id}` },
  ]);

  return {
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  };
}

export function formatTelegramApprovalAlert(pending: PendingReply): string {
  return `<b>🛡️ Nayeem AI Desk: Approval Required</b>
<b>Contact:</b> ${pending.contactName} (${pending.contactPhone})
<b>Category:</b> <code>${pending.category}</code>
<b>Confidence:</b> ${(pending.confidenceScore * 100).toFixed(0)}%

<b>Inbound Message:</b>
<i>"${pending.inboundText}"</i>

<b>Proposed AI Response:</b>
<i>"${pending.proposedText}"</i>

<b>Policy Decision Reason:</b>
${pending.decisionReason || 'Requires personal approval by policy.'}`;
}
