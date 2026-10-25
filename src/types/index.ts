export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus =
  | 'received'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'failed';

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageSource =
  | 'manual_web'
  | 'manual_telegram'
  | 'ai_auto_reply'
  | 'pending_approval'
  | 'system';

export type ContactMode = 'auto_reply' | 'approval_required' | 'human_takeover';

export type MessageCategory =
  | 'faq_business'
  | 'general_personal'
  | 'romantic_flirtatious'
  | 'sensitive'
  | 'uncertain'
  | 'urgent';

export interface Contact {
  id: string;
  phoneNumber: string;
  name: string;
  channel: string;
  preferredLanguage: string;
  tags: string[];
  notes: string;
  mode?: ContactMode;
  unreadCount?: number;
  isLocked?: boolean;
  lockedUntil?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  contactId: string;
  direction: MessageDirection;
  content: string;
  rawPayload?: Record<string, unknown>;
  whatsappMessageId?: string;
  telegramMessageId?: string;
  status: MessageStatus;
  deliveryStatus?: DeliveryStatus;
  source?: MessageSource;
  category?: MessageCategory;
  confidenceScore?: number;
  detectedLanguage?: string;
  failureReason?: string;
  createdAt: string;
}

export interface PendingReply {
  id: string;
  messageId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  inboundText: string;
  proposedText: string;
  category: MessageCategory;
  confidenceScore: number;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  editedText?: string;
  decisionReason?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface ContactMemory {
  id: string;
  contactId: string;
  memoryType: 'user_stated' | 'inferred_preference' | 'summary';
  memoryText: string;
  confidence: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeCategory =
  | 'general'
  | 'technical'
  | 'pricing'
  | 'profile'
  | 'faq'
  | 'service'
  | 'project'
  | 'skill'
  | 'education'
  | 'social'
  | 'policy';

export interface KnowledgeItem {
  id: string;
  key: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AISettings {
  id: string;
  autoReplyEnabled: boolean;
  allowedCategories: MessageCategory[];
  confidenceThreshold: number;
  defaultTone: 'friendly_professional' | 'concise' | 'formal';
  languageMatching: 'match_sender' | 'english_only' | 'bangla_only';
  systemPrompt: string;
  telegramAlertsEnabled: boolean;
  maxHistoryInContext: number;
  retentionDays: number;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  eventId: string;
  source: 'whatsapp' | 'telegram' | 'test';
  eventType: string;
  payloadHash: string;
  status: 'processed' | 'duplicate' | 'failed';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  eventType: string;
  actor: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface IntegrationStatus {
  service: 'whatsapp' | 'gemini' | 'postgres' | 'telegram';
  status: 'connected' | 'disconnected' | 'mock_mode' | 'configured';
  message: string;
  lastChecked: string;
  details?: Record<string, unknown>;
}

export interface ClassificationResult {
  category: MessageCategory;
  confidence: number;
  detectedLanguage: 'en' | 'bn' | 'banglish';
  reasoning: string;
  isHighImpact: boolean;
  isInjectionAttempt: boolean;
  extractedPreferences?: string[];
}

export interface ConversationInsights {
  contactId: string;
  currentTopic: string;
  userIntent: string;
  unansweredQuestions: string[];
  recentCommitments: string[];
  previousContextSummary: string;
  suggestedDraftReply: string;
  isCompleteHistoryAvailable: boolean;
  generatedAt: string;
}

export interface WebsitePageSource {
  id: string;
  url: string;
  title: string;
  contentHash: string;
  headings: string[];
  excerpt: string;
  fullText?: string;
  lastFetchedAt: string;
  lastModifiedHeader?: string;
  status: 'discovered' | 'changed' | 'unchanged' | 'approved' | 'rejected' | 'error';
  errorMessage?: string;
  approvedAt?: string;
  promotedKnowledgeId?: string;
}

export interface WebsiteSyncStatus {
  domain: string;
  lastSyncAt: string | null;
  nextScheduledSyncAt: string | null;
  totalPagesDiscovered: number;
  totalApproved: number;
  pendingReviewCount: number;
  lastStatus: 'idle' | 'syncing' | 'completed' | 'failed';
  lastError?: string;
}

export interface WebsiteSyncHistory {
  id: string;
  timestamp: string;
  pagesScanned: number;
  pagesChanged: number;
  status: 'success' | 'partial' | 'failed';
  details?: Record<string, unknown>;
}

export interface FAQImportPreviewItem {
  key: string;
  question: string;
  answer: string;
  category: KnowledgeCategory;
  tags: string[];
  language?: string;
  isDuplicate?: boolean;
  existingId?: string;
}

export interface FAQImportResult {
  totalProcessed: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}

