
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
CREATE TABLE IF NOT EXISTS inbox_messages (
 id TEXT PRIMARY KEY, platform TEXT, external_id TEXT, sender TEXT, message TEXT,
 category TEXT, priority TEXT, reply_suggestion TEXT, status TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
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
