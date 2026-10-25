import crypto from 'node:crypto';

export interface WhatsAppInboundMessage {
  messageId: string;
  fromPhone: string;
  senderName: string;
  text: string;
  timestamp: string;
  rawPayload: Record<string, unknown>;
}

export function verifyWhatsAppWebhookGet(query: Record<string, string | undefined>): {
  isValid: boolean;
  challenge?: string;
  reason?: string;
} {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!mode || !token) {
    return { isValid: false, reason: 'Missing hub.mode or hub.verify_token parameters' };
  }

  if (mode !== 'subscribe') {
    return { isValid: false, reason: `Unsupported hub.mode: ${mode}` };
  }

  if (configuredToken && token !== configuredToken) {
    return { isValid: false, reason: 'Verification token does not match WHATSAPP_VERIFY_TOKEN' };
  }

  return { isValid: true, challenge: challenge || '' };
}

export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader?: string,
  appSecret?: string
): boolean {
  const secret = appSecret || process.env.META_APP_SECRET;
  if (!secret) {
    // If secret not configured in local environment, allow pass-through with warning log
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const bufProvided = Buffer.from(parts[1], 'utf-8');
  const bufExpected = Buffer.from(expectedHash, 'utf-8');

  if (bufProvided.length !== bufExpected.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

export function isWithinWhatsApp24HourWindow(lastInboundTimestamp?: string): boolean {
  if (!lastInboundTimestamp) return true; // New conversation or same-session
  const lastTime = new Date(lastInboundTimestamp).getTime();
  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return now - lastTime <= twentyFourHoursMs;
}

export interface WhatsAppStatusUpdate {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipientId: string;
  timestamp: string;
  error?: string;
}

export interface ParsedWhatsAppPayload {
  messages: WhatsAppInboundMessage[];
  statuses: WhatsAppStatusUpdate[];
}

export function parseWhatsAppWebhookBody(body: Record<string, any>): ParsedWhatsAppPayload {
  const parsedMessages: WhatsAppInboundMessage[] = [];
  const parsedStatuses: WhatsAppStatusUpdate[] = [];

  try {
    const entryList = body.entry || [];
    for (const entry of entryList) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === 'messages') {
          const value = change.value || {};
          const contacts = value.contacts || [];
          const contactName = contacts[0]?.profile?.name || 'WhatsApp User';
          const messages = value.messages || [];

          for (const m of messages) {
            if (m.type === 'text') {
              parsedMessages.push({
                messageId: m.id,
                fromPhone: m.from,
                senderName: contactName,
                text: m.text?.body || '',
                timestamp: m.timestamp ? new Date(parseInt(m.timestamp, 10) * 1000).toISOString() : new Date().toISOString(),
                rawPayload: m,
              });
            }
          }

          // Parse delivery statuses (sent, delivered, read, failed)
          const statuses = value.statuses || [];
          for (const s of statuses) {
            const rawStatus = (s.status || '').toLowerCase();
            let normStatus: 'sent' | 'delivered' | 'read' | 'failed' = 'sent';
            if (rawStatus === 'delivered') normStatus = 'delivered';
            else if (rawStatus === 'read') normStatus = 'read';
            else if (rawStatus === 'failed') normStatus = 'failed';

            const errObj = s.errors?.[0];
            const errorMsg = errObj ? `${errObj.title || 'Error'}: ${errObj.message || ''}` : undefined;

            parsedStatuses.push({
              messageId: s.id,
              status: normStatus,
              recipientId: s.recipient_id || '',
              timestamp: s.timestamp ? new Date(parseInt(s.timestamp, 10) * 1000).toISOString() : new Date().toISOString(),
              error: errorMsg,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Parse Error]:', err);
  }

  return { messages: parsedMessages, statuses: parsedStatuses };
}

export async function sendWhatsAppMessage(toPhone: string, text: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  mode: 'real' | 'simulated';
}> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (
    !token ||
    !phoneNumberId ||
    token === 'your_meta_whatsapp_system_user_access_token' ||
    phoneNumberId === 'your_whatsapp_phone_number_id'
  ) {
    // When credentials not set, do not fake live delivery! Explicitly report simulated mode.
    return {
      success: true,
      mode: 'simulated',
      messageId: `sim_wa_${Date.now()}`,
      error: 'WhatsApp credentials not live; outbound message recorded in simulated mode.',
    };
  }

  // Sanitize phone number (digits only, e.g. 8801711002233)
  const cleanPhone = toPhone.replace(/\D/g, '');

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await response.json() as Record<string, any>;
    if (!response.ok) {
      console.error('[WhatsApp API Send Error]:', data);
      return {
        success: false,
        mode: 'real',
        error: data.error?.message || `HTTP ${response.status} from Meta WhatsApp Graph API`,
      };
    }

    const waMsgId = data.messages?.[0]?.id;
    return {
      success: true,
      mode: 'real',
      messageId: waMsgId,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      mode: 'real',
      error: `Network failure calling Meta Graph API: ${msg}`,
    };
  }
}
