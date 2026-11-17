-- DRAFT — NOT APPLIED. Owner approval required before any Production D1 execution.
-- Adds reason_code 'processing_failed' to owner_escalations so that an inbound message whose processing failed (no reply draft)
-- can open a durable owner case. SQLite cannot alter a CHECK constraint: the table is rebuilt with identical columns, rows,
-- indexes and the no-delete trigger. Run inside one transaction (D1: wrangler d1 execute --file, owner-run).
PRAGMA foreign_keys=OFF;
DROP TRIGGER IF EXISTS owner_escalations_no_delete;
CREATE TABLE owner_escalations__processing_failed (
  id TEXT PRIMARY KEY,escalation_key TEXT NOT NULL UNIQUE,lead_id TEXT,conversation_id TEXT,contact_id TEXT,channel TEXT NOT NULL,source_message_id TEXT,sales_brain_event_id TEXT NOT NULL,context_hash TEXT,current_sales_stage TEXT,context_summary TEXT NOT NULL,unresolved_question TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK(reason_code IN ('missing_business_knowledge','conflicting_business_knowledge','unsupported_price','unauthorized_discount','unclear_moq','unusual_customization','uncertain_production_capability','uncertain_production_time','uncertain_shipping','unusual_commercial_terms','ambiguous_customer_identity','low_confidence_commercial_interpretation','unsupported_factual_claim','processing_failed')),
  decision_required TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','resolved')),version INTEGER NOT NULL CHECK(version>0),owner_decision TEXT,owner_note TEXT,resolved_by TEXT,resolved_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
  CHECK(status='open' OR (owner_decision IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK(reason_code='ambiguous_customer_identity' OR (lead_id IS NOT NULL AND conversation_id IS NOT NULL))
);
INSERT INTO owner_escalations__processing_failed SELECT id,escalation_key,lead_id,conversation_id,contact_id,channel,source_message_id,sales_brain_event_id,context_hash,current_sales_stage,context_summary,unresolved_question,reason_code,decision_required,status,version,owner_decision,owner_note,resolved_by,resolved_at,created_at,updated_at FROM owner_escalations;
DROP TABLE owner_escalations;
ALTER TABLE owner_escalations__processing_failed RENAME TO owner_escalations;
CREATE INDEX IF NOT EXISTS idx_owner_escalations_open ON owner_escalations(status,created_at);
CREATE INDEX IF NOT EXISTS idx_owner_escalations_conversation ON owner_escalations(lead_id,conversation_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_escalations_open_source_reason ON owner_escalations(source_message_id,reason_code) WHERE status='open' AND source_message_id IS NOT NULL AND source_message_id<>'';
CREATE TRIGGER IF NOT EXISTS owner_escalations_no_delete BEFORE DELETE ON owner_escalations BEGIN SELECT RAISE(ABORT,'Owner escalation history cannot be deleted'); END;
PRAGMA foreign_keys=ON;
