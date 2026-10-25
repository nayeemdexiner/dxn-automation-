-- Initial Schema for Nayeem AI Desk
-- PostgreSQL Migration 001

CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

INSERT INTO admin_users (username, password_hash)
VALUES
('selldxnxd@gmail.com', 'ChangeMe_NayeemAdmin2026!'),
('nayeem', 'ChangeMe_NayeemAdmin2026!'),
('admin', 'ChangeMe_NayeemAdmin2026!')
ON CONFLICT (username) DO NOTHING;

CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(100) PRIMARY KEY,
    phone_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(50) DEFAULT 'whatsapp',
    preferred_language VARCHAR(50) DEFAULT 'auto',
    tags TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',
    last_inbound_at TIMESTAMP WITH TIME ZONE,
    last_outbound_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(100) PRIMARY KEY,
    contact_id VARCHAR(100) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content TEXT NOT NULL,
    raw_payload JSONB,
    whatsapp_message_id VARCHAR(255),
    telegram_message_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending_approval', 'approved', 'rejected', 'sent', 'failed')),
    category VARCHAR(50) CHECK (category IN ('faq_business', 'general_personal', 'romantic_flirtatious', 'sensitive', 'uncertain', 'urgent')),
    confidence_score NUMERIC(4, 3) DEFAULT 1.000,
    detected_language VARCHAR(50) DEFAULT 'en',
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

CREATE TABLE IF NOT EXISTS pending_replies (
    id VARCHAR(100) PRIMARY KEY,
    message_id VARCHAR(100) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    contact_id VARCHAR(100) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    inbound_text TEXT NOT NULL,
    proposed_text TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
    edited_text TEXT,
    decision_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pending_replies_status ON pending_replies(status);

CREATE TABLE IF NOT EXISTS contact_memories (
    id VARCHAR(100) PRIMARY KEY,
    contact_id VARCHAR(100) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL CHECK (memory_type IN ('user_stated', 'inferred_preference', 'summary')),
    memory_text TEXT NOT NULL,
    confidence NUMERIC(4, 3) DEFAULT 0.900,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_memories_contact ON contact_memories(contact_id);

CREATE TABLE IF NOT EXISTS knowledge_base (
    id VARCHAR(100) PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('profile', 'faq', 'service', 'project', 'skill', 'education', 'social', 'policy')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    auto_reply_enabled BOOLEAN DEFAULT TRUE,
    allowed_categories TEXT[] DEFAULT ARRAY['faq_business'],
    confidence_threshold NUMERIC(4, 3) DEFAULT 0.850,
    default_tone VARCHAR(50) DEFAULT 'friendly_professional',
    language_matching VARCHAR(50) DEFAULT 'match_sender',
    system_prompt TEXT NOT NULL,
    telegram_alerts_enabled BOOLEAN DEFAULT TRUE,
    max_history_in_context INTEGER DEFAULT 10,
    retention_days INTEGER DEFAULT 180,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(100) PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    source VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) DEFAULT 'processed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
