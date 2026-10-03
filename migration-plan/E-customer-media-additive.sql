-- HAMZEHI P0 customer multimodal: smallest ADDITIVE schema step. NOT APPLIED anywhere.
-- One new table + three indexes. No ALTER, no DROP, no change to any existing table or row (W40 untouched).
-- REQUIRED, explicit production schema path: the Worker performs NO runtime DDL for this table. Until this is applied,
-- customer images are skipped safely (audit 'customer_image_schema_missing') and inbound continues text-only.
-- Apply BEFORE (or right after) deploying. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS conversation_customer_media (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 inbox_message_id TEXT NOT NULL UNIQUE,
 platform TEXT NOT NULL DEFAULT 'telegram',
 chat_id TEXT NOT NULL,
 telegram_message_id TEXT NOT NULL,
 update_id TEXT,
 media_group_id TEXT,
 media_type TEXT NOT NULL,
 file_id TEXT NOT NULL,
 file_unique_id TEXT,
 mime_type TEXT,
 file_size INTEGER,
 width INTEGER,
 height INTEGER,
 caption TEXT,
 analysis_status TEXT NOT NULL CHECK(analysis_status IN ('pending','analyzing','analyzed','failed','unavailable','unsupported')),
 analysis_attempts INTEGER NOT NULL DEFAULT 0 CHECK(analysis_attempts>=0),
 analysis_phase TEXT CHECK(analysis_phase IS NULL OR analysis_phase IN ('claimed','vision_requested')),
 analysis_started_at TEXT,
 observation_json TEXT CHECK(observation_json IS NULL OR json_valid(observation_json)),
 reused_from_media_id TEXT,
 error_code TEXT,
 analyzed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_media_conversation ON conversation_customer_media(lead_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_media_file ON conversation_customer_media(conversation_id, file_unique_id);
CREATE INDEX IF NOT EXISTS idx_customer_media_status ON conversation_customer_media(analysis_status, updated_at);

-- Postcheck (read-only):
-- SELECT name FROM sqlite_master WHERE name IN ('conversation_customer_media','idx_customer_media_conversation','idx_customer_media_file','idx_customer_media_status');
-- Rollback (only if empty and explicitly approved): DROP TABLE conversation_customer_media;
