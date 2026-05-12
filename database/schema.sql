-- ============================================================
-- MUSE CRM Database Schema v1.0
-- 基於 PRD v0.1 第四章實體定義
-- ============================================================

-- 擴展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. contacts（客戶）
-- ============================================================
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name    VARCHAR(255),
    avatar_url      TEXT,
    locale          VARCHAR(10),
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_channel  VARCHAR(50),                           -- 'messenger' | 'instagram' | 'line' | 'webchat'
    source_type     VARCHAR(50),                           -- 'ad_referral' | 'organic'
    notes           TEXT,
    phone           VARCHAR(50),
    email           VARCHAR(255),
    intent          VARCHAR(50),                             -- 購買意向: browsing/interested/ready_to_buy/purchased
    budget_range    VARCHAR(50),                             -- 預算區間: under_50k/50k_200k/200k_500k/over_500k
    preferred_products TEXT[],                               -- 偏好產品
    visit_date      DATE,                                    -- 來訪日期
    referral_source VARCHAR(255),                            -- 轉介來源
    contact_status  VARCHAR(20) DEFAULT 'new',               -- 跟進狀態: new/following_up/quoted/won/lost
    assigned_to     UUID,                                   -- FK 在檔案末尾用 ALTER TABLE 建立（因 users 表在後面）
    external_crm_id VARCHAR(255),                          -- 預留：外部 CRM 同步 ID
    is_merged       BOOLEAN NOT NULL DEFAULT FALSE,
    merged_into_id  UUID REFERENCES contacts(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_last_active ON contacts(last_active_at DESC);
CREATE INDEX idx_contacts_source ON contacts(source_channel, source_type);
CREATE INDEX idx_contacts_merged ON contacts(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;

-- ============================================================
-- 2. channel_identifiers（渠道身份，多對一關聯 contact）
-- ============================================================
CREATE TABLE channel_identifiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel         VARCHAR(50) NOT NULL,                  -- 'messenger' | 'instagram' | 'line'
    external_id     VARCHAR(255) NOT NULL,                 -- PSID / ASID / LINE User ID
    asid            VARCHAR(255),                          -- Meta App-Scoped User ID（合併用）
    profile_data    JSONB,                                 -- 渠道特定 profile 資料
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel, external_id)
);

CREATE INDEX idx_channel_ids_contact ON channel_identifiers(contact_id);
CREATE INDEX idx_channel_ids_asid ON channel_identifiers(asid) WHERE asid IS NOT NULL;

-- ============================================================
-- 3. conversations（對話 Session）
-- ============================================================
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'closed')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    timeout_minutes INT NOT NULL DEFAULT 240,              -- 預設 4 小時
    -- Ad Referral
    ad_referral     JSONB,                                 -- { ad_id, campaign_name, creative_id }
    has_ad_referral BOOLEAN GENERATED ALWAYS AS (ad_referral IS NOT NULL) STORED,
    -- Meta
    message_count   INT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status, last_message_at DESC);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_ad ON conversations(has_ad_referral) WHERE has_ad_referral = TRUE;

-- ============================================================
-- 4. messages（原始訊息）
-- ============================================================
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    sender_type     VARCHAR(20) NOT NULL
                    CHECK (sender_type IN ('customer', 'business', 'system')),
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text', 'image', 'sticker', 'attachment', 'referral')),
    content         TEXT,
    media_url       TEXT,
    message_metadata JSONB,                                -- 附件 metadata、貼圖 ID 等
    meta_message_id VARCHAR(255) UNIQUE,                   -- Meta 平台訊息 ID（冪等性）
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    -- 快速分類欄位（Phase 5A: 輕量 per-message triage）
    quick_intent    VARCHAR(50),                           -- pricing/spec/visit/complaint/greeting/order/followup/other
    quick_identity  VARCHAR(50),                           -- 設計師/屋主/建材行/工班/unknown
    quick_analyzed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at);
CREATE INDEX idx_messages_contact ON messages(contact_id);
CREATE INDEX idx_messages_meta_id ON messages(meta_message_id) WHERE meta_message_id IS NOT NULL;
CREATE INDEX idx_messages_content_search ON messages USING gin(to_tsvector('simple', content));

-- ============================================================
-- 5. analyses（LLM 分析結果，1:N 對 conversation）
-- ============================================================
CREATE TABLE analyses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id          UUID NOT NULL REFERENCES contacts(id),
    -- MVP 萃取欄位
    customer_name       VARCHAR(255),
    demand_summary      TEXT,
    mentioned_products  TEXT[],                             -- PostgreSQL 陣列
    suggested_tags      TEXT[],
    conversation_summary TEXT,
    suggested_action    TEXT,
    -- 後續欄位（v2）
    sentiment           VARCHAR(20),                       -- 'positive' | 'neutral' | 'negative'
    intent              VARCHAR(50),
    urgency             VARCHAR(10),                       -- 'high' | 'medium' | 'low'
    customer_stage      VARCHAR(50),
    -- Meta
    trigger_type        VARCHAR(20) NOT NULL DEFAULT 'auto'
                        CHECK (trigger_type IN ('auto', 'manual')),
    is_human_corrected  BOOLEAN NOT NULL DEFAULT FALSE,
    correction_diff     JSONB,                             -- 修正前後差異
    model_used          VARCHAR(100),
    tokens_used         INT,
    processing_time_ms  INT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analyses_conversation ON analyses(conversation_id, created_at DESC);
CREATE INDEX idx_analyses_contact ON analyses(contact_id);

-- ============================================================
-- 6. actions（待辦動作）
-- ============================================================
CREATE TABLE actions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id),     -- 可選關聯
    description     TEXT NOT NULL,
    source          VARCHAR(20) NOT NULL DEFAULT 'llm'
                    CHECK (source IN ('llm', 'manual')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
    priority        VARCHAR(10) NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('high', 'medium', 'low')),
    assigned_to     VARCHAR(255),                          -- 預留：使用者 ID
    due_date        DATE,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_contact ON actions(contact_id);
CREATE INDEX idx_actions_status ON actions(status, priority, due_date);
CREATE INDEX idx_actions_assigned ON actions(assigned_to) WHERE assigned_to IS NOT NULL;

-- ============================================================
-- 7. （已下線）tags / contact_tags — Tag 系統於 2026-05-12 重構移除
-- ============================================================

-- ============================================================
-- 9. users（使用者，預留權限系統）
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    password_hash   VARCHAR(255),
    role            VARCHAR(20) NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'manager', 'user')),
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    team_id         VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. user_notes（使用者備註）
-- ============================================================
CREATE TABLE user_notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    author_id   UUID REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_notes_contact ON user_notes(contact_id, created_at DESC);

-- ============================================================
-- 11. analysis_queue（分析佇列，LLM 不可用時排隊）
-- ============================================================
CREATE TABLE analysis_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count     INT NOT NULL DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ
);

CREATE INDEX idx_queue_status ON analysis_queue(status, created_at);

-- ============================================================
-- 觸發器：自動更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_actions_updated BEFORE UPDATE ON actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_notes_updated BEFORE UPDATE ON user_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 延遲建立的 FK（解決表建立順序相依）
-- ============================================================
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES users(id);