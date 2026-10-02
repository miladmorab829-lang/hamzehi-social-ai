
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
 updated_at TEXT NOT NULL,
 request_id TEXT,
 config_key TEXT,
 price_version_id TEXT,
 custom_price_decision_id TEXT,
 margin_json TEXT,
 discount_reason TEXT
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
 updated_at TEXT NOT NULL,
 unit_cost_minor INTEGER,
 shipping_cost_minor INTEGER,
 other_cost_minor INTEGER,
 carrier TEXT,
 tracking_reference TEXT,
 shipped_at TEXT,
 delivered_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_orders_quote ON lead_orders(quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_orders_number ON lead_orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_orders_acceptance_inbox
ON lead_orders(acceptance_inbox_message_id)
WHERE acceptance_inbox_message_id IS NOT NULL AND acceptance_inbox_message_id <> '';
CREATE INDEX IF NOT EXISTS idx_lead_orders_lead ON lead_orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_orders_conversation ON lead_orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_orders_status ON lead_orders(status);
CREATE TABLE IF NOT EXISTS lead_order_payments (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL,
 lead_id TEXT NOT NULL,
 payment_kind TEXT NOT NULL,
 amount_minor INTEGER NOT NULL,
 currency TEXT NOT NULL,
 method TEXT NOT NULL,
 reference TEXT NOT NULL,
 reference_key TEXT NOT NULL,
 received_at TEXT,
 notes TEXT,
 recorded_by TEXT NOT NULL,
 recorded_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_order_payments_reference
ON lead_order_payments(order_id, method, reference_key);
CREATE INDEX IF NOT EXISTS idx_lead_order_payments_order ON lead_order_payments(order_id);
CREATE TRIGGER IF NOT EXISTS trg_lead_order_payments_no_update BEFORE UPDATE ON lead_order_payments
BEGIN SELECT RAISE(ABORT, 'lead_order_payments is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_lead_order_payments_no_delete BEFORE DELETE ON lead_order_payments
BEGIN SELECT RAISE(ABORT, 'lead_order_payments is append-only'); END;
-- Sales intelligence: owner-approved, versioned structured knowledge (status current/superseded/retired; history never deleted).
CREATE TABLE IF NOT EXISTS product_catalog (id TEXT PRIMARY KEY, product_key TEXT NOT NULL, family TEXT, name TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]',
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_catalog_current ON product_catalog(product_key) WHERE status='current';
CREATE TABLE IF NOT EXISTS product_attribute_schema (id TEXT PRIMARY KEY, product_key TEXT NOT NULL, attribute_key TEXT NOT NULL, label TEXT NOT NULL, attribute_kind TEXT NOT NULL,
 value_type TEXT NOT NULL, required INTEGER NOT NULL, commercial_critical INTEGER NOT NULL, allowed_values_json TEXT NOT NULL DEFAULT '[]', question_fa TEXT, question_ar TEXT, priority INTEGER NOT NULL DEFAULT 100,
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attribute_current ON product_attribute_schema(product_key,attribute_key) WHERE status='current';
CREATE TABLE IF NOT EXISTS product_configurations (id TEXT PRIMARY KEY, product_key TEXT NOT NULL, market TEXT NOT NULL, config_key TEXT NOT NULL, attributes_json TEXT NOT NULL, label TEXT,
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_configuration_current ON product_configurations(product_key,market,config_key) WHERE status='current';
CREATE TABLE IF NOT EXISTS compatibility_rules (id TEXT PRIMARY KEY, rule_key TEXT NOT NULL, scope_json TEXT NOT NULL, attributes_json TEXT NOT NULL, verdict TEXT NOT NULL,
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compatibility_current ON compatibility_rules(rule_key) WHERE status='current';
CREATE TABLE IF NOT EXISTS price_versions (id TEXT PRIMARY KEY, market TEXT NOT NULL, product_key TEXT NOT NULL, config_key TEXT NOT NULL, quantity_min INTEGER NOT NULL, quantity_max INTEGER,
 currency TEXT NOT NULL, unit_price_minor INTEGER NOT NULL, moq INTEGER, conditions_json TEXT NOT NULL DEFAULT '{}', effective_from TEXT, effective_until TEXT,
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_versions_current ON price_versions(market,product_key,config_key,quantity_min,COALESCE(quantity_max,-1)) WHERE status='current';
CREATE TABLE IF NOT EXISTS cost_versions (id TEXT PRIMARY KEY, market TEXT NOT NULL, product_key TEXT NOT NULL, config_key TEXT NOT NULL, quantity_min INTEGER NOT NULL, quantity_max INTEGER,
 component TEXT NOT NULL, basis TEXT NOT NULL, currency TEXT NOT NULL, amount_minor INTEGER NOT NULL,
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_versions_current ON cost_versions(market,product_key,config_key,quantity_min,COALESCE(quantity_max,-1),component) WHERE status='current';
CREATE TABLE IF NOT EXISTS business_settings (id TEXT PRIMARY KEY, setting_key TEXT NOT NULL, scope_key TEXT NOT NULL, value_json TEXT NOT NULL,
 version INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source_decision_id TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_settings_current ON business_settings(setting_key,scope_key) WHERE status='current';
CREATE TABLE IF NOT EXISTS sales_requests (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, conversation_id TEXT NOT NULL, market TEXT, product_key TEXT, product_text TEXT, quantity INTEGER,
 requirements_json TEXT NOT NULL DEFAULT '{}', unknown_json TEXT NOT NULL DEFAULT '[]', case_overrides_json TEXT NOT NULL DEFAULT '{}', request_class TEXT, matched_config_key TEXT,
 missing_json TEXT NOT NULL DEFAULT '[]', custom_reasons_json TEXT NOT NULL DEFAULT '[]', quote_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_requests_conversation ON sales_requests(conversation_id);
CREATE TABLE IF NOT EXISTS owner_decisions (id TEXT PRIMARY KEY, status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 50, decision_type TEXT NOT NULL, fingerprint TEXT NOT NULL,
 lead_id TEXT, conversation_id TEXT, market TEXT, product_key TEXT, request_id TEXT, quote_id TEXT, order_id TEXT, question TEXT NOT NULL,
 known_json TEXT NOT NULL DEFAULT '{}', missing_json TEXT NOT NULL DEFAULT '[]', conflicting_json TEXT NOT NULL DEFAULT '[]', history_json TEXT NOT NULL DEFAULT '[]',
 recommendation TEXT, risk TEXT, payload_json TEXT NOT NULL DEFAULT '{}', owner_decision TEXT, owner_answer_json TEXT, owner_note TEXT, scope_json TEXT, knowledge_action TEXT,
 resulting_ref TEXT, resolved_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_decisions_pending ON owner_decisions(fingerprint) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_owner_decisions_status ON owner_decisions(status,priority);
CREATE TABLE IF NOT EXISTS knowledge_gaps (fingerprint TEXT PRIMARY KEY, decision_type TEXT NOT NULL, product_key TEXT, attribute_key TEXT, value_text TEXT, occurrences INTEGER NOT NULL,
 lead_ids_json TEXT NOT NULL DEFAULT '[]', examples_json TEXT NOT NULL DEFAULT '[]', first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, status TEXT NOT NULL, proposal_decision_id TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS draft_corrections (outreach_id TEXT PRIMARY KEY, lead_id TEXT, conversation_id TEXT, inbox_message_id TEXT, market TEXT, request_class TEXT, product_key TEXT, config_key TEXT,
 ai_draft TEXT, final_text TEXT, change_kind TEXT NOT NULL, changed_json TEXT NOT NULL DEFAULT '{}', owner_outcome TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS revenue_attribution (order_id TEXT PRIMARY KEY, lead_id TEXT, market TEXT, currency TEXT, lead_source TEXT, request_class TEXT, product_key TEXT, config_key TEXT, quantity INTEGER,
 quote_id TEXT, price_version_id TEXT, pricing_mode TEXT, discount_minor INTEGER, total_minor INTEGER, paid_minor INTEGER, profit_minor INTEGER, order_status TEXT, repeat_index INTEGER, created_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage_ledger (id TEXT PRIMARY KEY, module TEXT NOT NULL, task TEXT NOT NULL, provider TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
 cost_status TEXT NOT NULL, cost_minor INTEGER, cost_currency TEXT, lead_id TEXT, conversation_id TEXT, quote_id TEXT, order_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ai_usage_module ON ai_usage_ledger(module,created_at);
CREATE TRIGGER IF NOT EXISTS trg_price_versions_immutable BEFORE UPDATE ON price_versions WHEN NEW.market IS NOT OLD.market OR NEW.product_key IS NOT OLD.product_key OR NEW.config_key IS NOT OLD.config_key OR NEW.quantity_min IS NOT OLD.quantity_min OR NEW.quantity_max IS NOT OLD.quantity_max OR NEW.currency IS NOT OLD.currency OR NEW.unit_price_minor IS NOT OLD.unit_price_minor OR NEW.moq IS NOT OLD.moq OR NEW.conditions_json IS NOT OLD.conditions_json OR NEW.effective_from IS NOT OLD.effective_from OR NEW.effective_until IS NOT OLD.effective_until OR NEW.version IS NOT OLD.version OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'price_versions history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_price_versions_no_delete BEFORE DELETE ON price_versions BEGIN SELECT RAISE(ABORT,'price_versions history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS trg_cost_versions_immutable BEFORE UPDATE ON cost_versions WHEN NEW.market IS NOT OLD.market OR NEW.product_key IS NOT OLD.product_key OR NEW.config_key IS NOT OLD.config_key OR NEW.quantity_min IS NOT OLD.quantity_min OR NEW.quantity_max IS NOT OLD.quantity_max OR NEW.component IS NOT OLD.component OR NEW.basis IS NOT OLD.basis OR NEW.currency IS NOT OLD.currency OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.version IS NOT OLD.version OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'cost_versions history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_cost_versions_no_delete BEFORE DELETE ON cost_versions BEGIN SELECT RAISE(ABORT,'cost_versions history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS trg_business_settings_immutable BEFORE UPDATE ON business_settings WHEN NEW.setting_key IS NOT OLD.setting_key OR NEW.scope_key IS NOT OLD.scope_key OR NEW.value_json IS NOT OLD.value_json OR NEW.version IS NOT OLD.version OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'business_settings history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_business_settings_no_delete BEFORE DELETE ON business_settings BEGIN SELECT RAISE(ABORT,'business_settings history cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS trg_product_configurations_immutable BEFORE UPDATE ON product_configurations WHEN NEW.product_key IS NOT OLD.product_key OR NEW.market IS NOT OLD.market OR NEW.config_key IS NOT OLD.config_key OR NEW.attributes_json IS NOT OLD.attributes_json OR NEW.version IS NOT OLD.version OR NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'product_configurations history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_product_configurations_no_delete BEFORE DELETE ON product_configurations BEGIN SELECT RAISE(ABORT,'product_configurations history cannot be deleted'); END;
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
