
CREATE TABLE IF NOT EXISTS contents (
 id TEXT PRIMARY KEY, topic TEXT NOT NULL, platform TEXT NOT NULL,
 language TEXT NOT NULL, market TEXT NOT NULL, content_type TEXT NOT NULL,
 objective TEXT NOT NULL, tone TEXT NOT NULL, hook TEXT, body TEXT, caption TEXT,
 cta TEXT, hashtags TEXT, visual_prompt TEXT, status TEXT NOT NULL DEFAULT 'draft',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approval_queue (
 id TEXT PRIMARY KEY, content_id TEXT NOT NULL, status TEXT NOT NULL,
 reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
 id TEXT PRIMARY KEY, name TEXT, contact TEXT, stage TEXT, priority TEXT,
 notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_identities (
 identity_key TEXT PRIMARY KEY,
 identity_type TEXT NOT NULL,
 normalized_value TEXT NOT NULL,
 lead_id TEXT NOT NULL,
 source TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_identities_lead ON lead_identities(lead_id);
CREATE TABLE IF NOT EXISTS lead_contacts (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 contact_type TEXT NOT NULL,
 raw_value TEXT NOT NULL,
 normalized_value TEXT NOT NULL,
 evidence_status TEXT NOT NULL,
 source TEXT,
 evidence_url TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(lead_id, contact_type, normalized_value)
);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead ON lead_contacts(lead_id);
CREATE TABLE IF NOT EXISTS inbox_messages (
 id TEXT PRIMARY KEY, platform TEXT, external_id TEXT, sender TEXT, message TEXT,
 category TEXT, priority TEXT, reply_suggestion TEXT, status TEXT,
 lead_id TEXT, conversation_id TEXT, provider_sender_id TEXT,
 provider_conversation_id TEXT, reply_to_provider_message_id TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_conversations (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 contact_id TEXT,
 platform TEXT NOT NULL,
 provider_conversation_id TEXT,
 provider_sender_id TEXT,
 provider_username TEXT,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_conversations_lead ON lead_conversations(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_conversations_provider
ON lead_conversations(platform, provider_conversation_id)
WHERE provider_conversation_id IS NOT NULL AND provider_conversation_id <> '';
CREATE TABLE IF NOT EXISTS lead_outreach (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 contact_id TEXT,
 conversation_id TEXT,
 inbox_message_id TEXT,
 channel TEXT NOT NULL,
 recipient TEXT NOT NULL,
 message TEXT NOT NULL,
 language TEXT NOT NULL,
 status TEXT NOT NULL,
 provider_message_id TEXT,
 provider_conversation_id TEXT,
 approved_at TEXT,
 approved_by TEXT,
 sent_at TEXT,
 error_code TEXT,
 error_detail TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_outreach_lead_status ON lead_outreach(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_outreach_contact ON lead_outreach(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_outreach_conversation ON lead_outreach(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_outreach_inbox_message
ON lead_outreach(inbox_message_id)
WHERE inbox_message_id IS NOT NULL AND inbox_message_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_outreach_provider_message
ON lead_outreach(channel, provider_message_id)
WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';
CREATE TABLE IF NOT EXISTS lead_quotes (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 inbox_message_id TEXT,
 outreach_id TEXT,
 market TEXT,
 market_source TEXT,
 pricing_mode TEXT,
 price_item_id TEXT,
 price_item_version INTEGER,
 product TEXT,
 quantity INTEGER,
 customization TEXT,
 destination TEXT,
 requested_price_discount TEXT,
 customer_notes TEXT,
 currency TEXT,
 unit_price_minor INTEGER,
 subtotal_minor INTEGER,
 discount_minor INTEGER,
 shipping_minor INTEGER,
 tax_minor INTEGER,
 other_fees_minor INTEGER,
 total_minor INTEGER,
 moq INTEGER,
 payment_terms TEXT,
 delivery_terms TEXT,
 notes TEXT,
 approved_quote_text TEXT,
 status TEXT NOT NULL,
 approved_by TEXT,
 approved_at TEXT,
 sent_at TEXT,
 expires_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_quotes_inbox
ON lead_quotes(inbox_message_id) WHERE inbox_message_id IS NOT NULL AND inbox_message_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_quotes_outreach
ON lead_quotes(outreach_id) WHERE outreach_id IS NOT NULL AND outreach_id <> '';
CREATE INDEX IF NOT EXISTS idx_lead_quotes_lead ON lead_quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_quotes_conversation ON lead_quotes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_quotes_status ON lead_quotes(status);
CREATE TABLE IF NOT EXISTS commercial_price_items (
 id TEXT PRIMARY KEY,
 product_key TEXT NOT NULL,
 product_name TEXT NOT NULL,
 sku TEXT,
 market TEXT NOT NULL,
 currency TEXT NOT NULL,
 unit_price_minor INTEGER NOT NULL,
 moq INTEGER,
 version INTEGER NOT NULL,
 active INTEGER NOT NULL,
 effective_from TEXT,
 effective_until TEXT,
 approved_by TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_price_version
ON commercial_price_items(market, product_key, version);
CREATE INDEX IF NOT EXISTS idx_commercial_price_sku_active
ON commercial_price_items(market, sku, active);
CREATE INDEX IF NOT EXISTS idx_commercial_price_key_active
ON commercial_price_items(market, product_key, active);
CREATE TABLE IF NOT EXISTS social_metrics (
 id TEXT PRIMARY KEY, content_id TEXT, platform TEXT, impressions INTEGER DEFAULT 0,
 reach INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0,
 shares INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0,
 metric_date TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_guardrails (
 id TEXT PRIMARY KEY, automation_enabled INTEGER NOT NULL DEFAULT 0,
 daily_generation_limit INTEGER NOT NULL DEFAULT 10,
 approval_required INTEGER NOT NULL DEFAULT 1,
 emergency_stop INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_feedback (
 id TEXT PRIMARY KEY, content_id TEXT, feedback_type TEXT, score REAL,
 notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_reports (
 id TEXT PRIMARY KEY, report_date TEXT NOT NULL, market TEXT, language TEXT,
 report_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT, audience TEXT,
 status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar (
 id TEXT PRIMARY KEY, campaign_id TEXT, content_id TEXT, planned_at TEXT,
 status TEXT NOT NULL DEFAULT 'planned', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS api_rate_limits (
 key TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS system_events (
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL,
 severity TEXT NOT NULL,
 message TEXT NOT NULL,
 details_json TEXT,
 created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS release_checks (
 id TEXT PRIMARY KEY,
 check_name TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PASS','FAIL','SKIP')),
 details TEXT,
 checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retry_queue (
 id TEXT PRIMARY KEY,
 operation TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 3,
 status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
 next_attempt_at TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS production_runs (
 id TEXT PRIMARY KEY,
 run_type TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('started','completed','failed','stopped')),
 summary_json TEXT,
 error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_release_checks_time ON release_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_retry_next ON retry_queue(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_prod_runs_time ON production_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at);
CREATE INDEX IF NOT EXISTS idx_approval_content_updated ON approval_queue(content_id,updated_at);
CREATE INDEX IF NOT EXISTS idx_contents_created ON contents(created_at);
CREATE INDEX IF NOT EXISTS idx_calendar_status_planned ON calendar(status,planned_at);
CREATE TABLE IF NOT EXISTS recovery_snapshots (
 id TEXT PRIMARY KEY,
 snapshot_type TEXT NOT NULL,
 created_at TEXT NOT NULL,
 manifest_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('created','verified','failed'))
);
CREATE TABLE IF NOT EXISTS provider_config (
 id TEXT PRIMARY KEY,
 provider_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('primary','backup')),
 base_url TEXT,
 enabled INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_runs (
 id TEXT PRIMARY KEY,
 direction TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planned','running','completed','failed')),
 details_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
