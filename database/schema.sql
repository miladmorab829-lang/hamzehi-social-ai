
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
CREATE TABLE IF NOT EXISTS conversation_sales_state (
 conversation_id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 sales_stage TEXT,
 market TEXT CHECK(market IS NULL OR market IN ('GLOBAL','IRAN','ARAB')),
 language TEXT,
 last_meaningful_inbox_message_id TEXT,
 last_meaningful_at TEXT,
 next_action TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 source_message_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_sales_state_lead
ON conversation_sales_state(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sales_state_stage
ON conversation_sales_state(sales_stage);
CREATE TABLE IF NOT EXISTS conversation_memory_facts (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 memory_key TEXT NOT NULL,
 fact_type TEXT NOT NULL,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 value_hash TEXT NOT NULL,
 source_message_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','superseded')),
 version INTEGER NOT NULL CHECK(version > 0),
 supersedes_fact_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(conversation_id, source_message_id, memory_key, value_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_memory_active
ON conversation_memory_facts(conversation_id, memory_key)
WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_conversation_memory_lead_conversation
ON conversation_memory_facts(lead_id, conversation_id, created_at);
CREATE TRIGGER IF NOT EXISTS conversation_memory_no_delete
BEFORE DELETE ON conversation_memory_facts
BEGIN SELECT RAISE(ABORT,'Customer memory history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS conversation_memory_immutable
BEFORE UPDATE ON conversation_memory_facts
WHEN NEW.id IS NOT OLD.id OR NEW.lead_id IS NOT OLD.lead_id
 OR NEW.conversation_id IS NOT OLD.conversation_id OR NEW.memory_key IS NOT OLD.memory_key
 OR NEW.fact_type IS NOT OLD.fact_type OR NEW.value_json IS NOT OLD.value_json
 OR NEW.value_hash IS NOT OLD.value_hash OR NEW.source_message_id IS NOT OLD.source_message_id
 OR NEW.version IS NOT OLD.version OR NEW.supersedes_fact_id IS NOT OLD.supersedes_fact_id
 OR NEW.created_at IS NOT OLD.created_at OR OLD.status='superseded' OR NEW.status NOT IN ('active','superseded')
BEGIN SELECT RAISE(ABORT,'Customer memory facts are immutable except supersession'); END;
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
CREATE TABLE IF NOT EXISTS lead_orders (
 id TEXT PRIMARY KEY,
 order_number TEXT NOT NULL,
 quote_id TEXT NOT NULL,
 lead_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 quote_outreach_id TEXT,
 acceptance_inbox_message_id TEXT,
 acceptance_provider_message_id TEXT,
 acceptance_source TEXT,
 customer_accepted_at TEXT,
 market TEXT,
 pricing_mode TEXT,
 price_item_id TEXT,
 price_item_version INTEGER,
 product TEXT NOT NULL,
 quantity INTEGER NOT NULL,
 customization TEXT,
 destination TEXT,
 currency TEXT NOT NULL,
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
 approved_quote_text TEXT,
 status TEXT NOT NULL,
 confirmed_by TEXT,
 confirmed_at TEXT,
 cancelled_by TEXT,
 cancelled_at TEXT,
 cancellation_reason TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_orders_quote ON lead_orders(quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_orders_number ON lead_orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_orders_acceptance_inbox
ON lead_orders(acceptance_inbox_message_id)
WHERE acceptance_inbox_message_id IS NOT NULL AND acceptance_inbox_message_id <> '';
CREATE INDEX IF NOT EXISTS idx_lead_orders_lead ON lead_orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_orders_conversation ON lead_orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_orders_status ON lead_orders(status);
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
CREATE TABLE IF NOT EXISTS visual_product_media (
 id TEXT PRIMARY KEY,
 source_platform TEXT NOT NULL CHECK(source_platform IN ('telegram','instagram')),
 source_identity TEXT NOT NULL UNIQUE,
 source_media_id TEXT,
 source_message_id TEXT,
 source_file_unique_id TEXT,
 source_post_id TEXT,
 source_account_id TEXT,
 media_type TEXT NOT NULL CHECK(media_type IN ('photo','video')),
 source_kind TEXT NOT NULL,
 ownership_status TEXT NOT NULL CHECK(ownership_status='owned'),
 generated_detected INTEGER NOT NULL DEFAULT 0 CHECK(generated_detected IN (0,1)),
 candidate_status TEXT NOT NULL CHECK(candidate_status IN ('candidate','verified','rejected','inactive')),
 verified_real_product INTEGER NOT NULL DEFAULT 0 CHECK(verified_real_product IN (0,1)),
 verified_by TEXT,
 verified_at TEXT,
 version INTEGER NOT NULL CHECK(version > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visual_product_media_candidates
ON visual_product_media(candidate_status, verified_real_product, source_platform);
CREATE TABLE IF NOT EXISTS visual_product_media_attributes (
 id TEXT PRIMARY KEY,
 visual_media_id TEXT NOT NULL,
 attribute_type TEXT NOT NULL CHECK(attribute_type IN ('model','category','use_case','size','exterior_color','interior_color','color_combination','printing','branding','other')),
 normalized_value TEXT NOT NULL,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 status TEXT NOT NULL CHECK(status IN ('active','superseded')),
 version INTEGER NOT NULL CHECK(version > 0),
 supersedes_attribute_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(visual_media_id, attribute_type, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visual_product_media_attribute_active
ON visual_product_media_attributes(visual_media_id, attribute_type)
WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_visual_product_media_attribute_lookup
ON visual_product_media_attributes(attribute_type, normalized_value, visual_media_id)
WHERE status='active';
CREATE TRIGGER IF NOT EXISTS visual_product_media_attributes_no_delete
BEFORE DELETE ON visual_product_media_attributes
BEGIN SELECT RAISE(ABORT,'Visual product attribute history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS visual_product_media_attributes_immutable
BEFORE UPDATE ON visual_product_media_attributes
WHEN NEW.id IS NOT OLD.id OR NEW.visual_media_id IS NOT OLD.visual_media_id
 OR NEW.attribute_type IS NOT OLD.attribute_type OR NEW.normalized_value IS NOT OLD.normalized_value
 OR NEW.value_json IS NOT OLD.value_json OR NEW.version IS NOT OLD.version
 OR NEW.supersedes_attribute_id IS NOT OLD.supersedes_attribute_id OR NEW.created_at IS NOT OLD.created_at
 OR OLD.status='superseded' OR NEW.status NOT IN ('active','superseded')
BEGIN SELECT RAISE(ABORT,'Visual product attributes are immutable except supersession'); END;
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
-- P0-7A: knowledge proposals are separate from approved fact revisions.
CREATE TABLE IF NOT EXISTS sales_knowledge_change_requests (
 id TEXT PRIMARY KEY,
 operation TEXT NOT NULL CHECK(operation IN ('ADD','EXPAND','UPDATE','REPLACE','DEACTIVATE','DELETE')),
 fact_key TEXT NOT NULL,
 domain TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_key TEXT NOT NULL,
 attribute TEXT NOT NULL,
 market TEXT NOT NULL CHECK(market IN ('GLOBAL','IRAN','ARAB')),
 member_key TEXT NOT NULL DEFAULT '',
 target_fact_id TEXT,
 target_version INTEGER,
 old_value_json TEXT,
 new_value_json TEXT NOT NULL CHECK(json_valid(new_value_json)),
 value_hash TEXT NOT NULL,
 effective_from TEXT,
 effective_until TEXT,
 proposal_hash TEXT NOT NULL,
 conflict_json TEXT NOT NULL CHECK(json_valid(conflict_json)),
 sensitivity TEXT NOT NULL CHECK(sensitivity IN ('standard','commercial')),
 confidence REAL CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
 status TEXT NOT NULL CHECK(status IN ('pending_review','approved','rejected','conflict','applied')),
 requested_by TEXT NOT NULL,
 source_type TEXT NOT NULL,
 source_command_id TEXT,
 reviewed_by TEXT,
 reviewed_at TEXT,
 review_note TEXT,
 applied_at TEXT,
 result_fact_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((target_fact_id IS NULL AND target_version IS NULL) OR (target_fact_id IS NOT NULL AND target_version > 0)),
 CHECK(status NOT IN ('approved','applied') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(status <> 'applied' OR (result_fact_id IS NOT NULL AND applied_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_sales_knowledge_requests_status ON sales_knowledge_change_requests(status,created_at);
CREATE TABLE IF NOT EXISTS sales_knowledge_facts (
 id TEXT PRIMARY KEY,
 fact_key TEXT NOT NULL,
 domain TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_key TEXT NOT NULL,
 attribute TEXT NOT NULL,
 market TEXT NOT NULL CHECK(market IN ('GLOBAL','IRAN','ARAB')),
 member_key TEXT NOT NULL DEFAULT '',
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 value_hash TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 status TEXT NOT NULL CHECK(status IN ('active','superseded','inactive','tombstoned')),
 authority TEXT NOT NULL CHECK(authority = 'owner_approved'),
 effective_from TEXT,
 effective_until TEXT,
 supersedes_fact_id TEXT,
 source_type TEXT NOT NULL,
 source_command_id TEXT,
 change_request_id TEXT NOT NULL UNIQUE,
 approved_by TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(fact_key,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_knowledge_active ON sales_knowledge_facts(fact_key) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_knowledge_member_value
 ON sales_knowledge_facts(domain,entity_type,entity_key,attribute,market,value_hash)
 WHERE status='active' AND member_key<>'';
CREATE INDEX IF NOT EXISTS idx_sales_knowledge_entity ON sales_knowledge_facts(domain,entity_type,entity_key,market);
CREATE TRIGGER IF NOT EXISTS sales_knowledge_no_delete BEFORE DELETE ON sales_knowledge_facts
 BEGIN SELECT RAISE(ABORT,'Knowledge history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS sales_knowledge_immutable BEFORE UPDATE ON sales_knowledge_facts
 WHEN NEW.id IS NOT OLD.id OR NEW.fact_key IS NOT OLD.fact_key
 OR NEW.domain IS NOT OLD.domain OR NEW.entity_type IS NOT OLD.entity_type
 OR NEW.entity_key IS NOT OLD.entity_key OR NEW.attribute IS NOT OLD.attribute
 OR NEW.market IS NOT OLD.market OR NEW.member_key IS NOT OLD.member_key
 OR NEW.value_json IS NOT OLD.value_json OR NEW.value_hash IS NOT OLD.value_hash
 OR NEW.version IS NOT OLD.version OR NEW.authority IS NOT OLD.authority
 OR NEW.effective_from IS NOT OLD.effective_from OR NEW.effective_until IS NOT OLD.effective_until
 OR NEW.supersedes_fact_id IS NOT OLD.supersedes_fact_id OR NEW.source_type IS NOT OLD.source_type
 OR NEW.source_command_id IS NOT OLD.source_command_id OR NEW.change_request_id IS NOT OLD.change_request_id
 OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at
 OR NEW.created_at IS NOT OLD.created_at
 OR OLD.status='superseded' OR NEW.status<>'superseded'
 BEGIN SELECT RAISE(ABORT,'Only superseding a knowledge revision is allowed'); END;
CREATE TABLE IF NOT EXISTS migration_runs (
 id TEXT PRIMARY KEY,
 direction TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planned','running','completed','failed')),
 details_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
