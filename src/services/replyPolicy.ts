import { AISettings, ClassificationResult, ContactMode, MessageCategory } from '../types/index.ts';

export interface PolicyEvaluation {
  shouldAutoSend: boolean;
  requiresAdminApproval: boolean;
  reason: string;
}

export function evaluateReplyPolicy(
  classification: ClassificationResult,
  settings: AISettings,
  options?: {
    isWithin24hWindow?: boolean;
    isDuplicate?: boolean;
    contactMode?: ContactMode;
    isLocked?: boolean;
  }
): PolicyEvaluation {
  // If duplicate, do not process
  if (options?.isDuplicate) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: false,
      reason: 'Duplicate event detected; skipped idempotently.',
    };
  }

  // Check manual takeover mode
  if (options?.contactMode === 'human_takeover') {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: false,
      reason: 'Contact is in Human Takeover mode. AI auto-reply is paused until Muhammad Nayeem explicitly resumes automated mode.',
    };
  }

  // Check active manual reply session lock
  if (options?.isLocked) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: false,
      reason: 'Contact conversation is locked by active admin reply session. AI auto-reply withheld to prevent race conditions.',
    };
  }

  // Check if contact specifically requires approval for every reply
  const forceContactApproval = options?.contactMode === 'approval_required';

  // Check prompt injection
  if (classification.isInjectionAttempt) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Prompt injection signature detected. Blocked auto-send and held for security review.',
    };
  }

  // Romantic / flirtatious messages MUST NEVER auto-send
  if (classification.category === 'romantic_flirtatious') {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Romantic and flirtatious messages strictly require personal admin approval. Automated emotional or relationship commitments are prohibited.',
    };
  }

  // Sensitive or confidential messages strictly require personal approval
  if (classification.category === 'sensitive') {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Sensitive/financial inquiry held for admin review to safeguard private information and commitments.',
    };
  }

  // Urgent messages require admin review
  if (classification.category === 'urgent') {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Urgent/emergency message escalated to admin for high-priority manual review.',
    };
  }

  // General personal messages require admin review by default unless allowed by admin in settings
  if (classification.category === 'general_personal' && !settings.allowedCategories.includes('general_personal')) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Casual personal conversations require admin review by default to protect personal boundaries. (Can be allowed in AI Settings > Allowed Categories).',
    };
  }

  // Uncertain messages require admin review
  if (classification.category === 'uncertain') {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Uncertain intent or low confidence. Escalate to admin for manual review.',
    };
  }

  // If auto-reply is globally disabled in settings
  if (!settings.autoReplyEnabled) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Auto-reply is globally disabled in AI settings. Draft held for manual approval.',
    };
  }

  // Check if category is explicitly allowed in settings
  if (!settings.allowedCategories.includes(classification.category)) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: `Category "${classification.category}" is not in the allowed auto-reply categories list.`,
    };
  }

  // Check confidence score
  if (classification.confidence < settings.confidenceThreshold) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: `Confidence score (${classification.confidence.toFixed(2)}) is below safety threshold (${settings.confidenceThreshold.toFixed(2)}).`,
    };
  }

  // WhatsApp 24-hour service window check
  if (options?.isWithin24hWindow === false) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Outside Meta 24-hour messaging window. Requires approved template or manual contact reach-out.',
    };
  }

  // If contact mode is explicitly set to require approval
  if (forceContactApproval) {
    return {
      shouldAutoSend: false,
      requiresAdminApproval: true,
      reason: 'Contact is specifically set to "Approval Required" mode. AI draft generated for admin review before sending.',
    };
  }

  // Low-risk FAQ / business verified inquiry that passed all checks
  return {
    shouldAutoSend: true,
    requiresAdminApproval: false,
    reason: 'Verified low-risk FAQ/business message with high confidence. Passed safety policy for automated reply.',
  };
}
