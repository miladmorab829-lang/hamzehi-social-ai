-- AGENT ORCHESTRATOR STAGE 2B — DRAFT MIGRATION. NOT APPLIED. DO NOT RUN without owner approval, a precheck,
-- a D1 export / Time Travel bookmark and a postcheck. Additive only (CREATE ... IF NOT EXISTS); no existing table is changed.

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  scheduler TEXT NOT NULL,                 -- e.g. 'autonomy'
  orchestrator_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  counts_json TEXT NOT NULL CHECK(json_valid(counts_json)),
  budget_spent INTEGER NOT NULL DEFAULT 0,
  budget_limit INTEGER NOT NULL,
  alert_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(alert_codes_json)),
  healthy INTEGER NOT NULL CHECK(healthy IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(scheduler, started_at);

CREATE TABLE IF NOT EXISTS agent_dead_letters (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  agent_version TEXT,
  state TEXT NOT NULL CHECK(state IN ('failed','timed_out')),
  attempts INTEGER NOT NULL,
  error_redacted TEXT,                     -- already redacted by agent-orchestrator.js redact(); max 500 chars
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution TEXT CHECK(resolution IS NULL OR resolution IN ('retried','dismissed')),
  action_token TEXT                        -- per-request nonce of the last owner transition (atomic audit guard)
);
CREATE INDEX IF NOT EXISTS idx_agent_dead_letters_open ON agent_dead_letters(resolved_at, created_at);

-- One OPEN row per (scheduler, code, agent); repeats bump occurrences/last_seen. Rows are never deleted: an acknowledged alert
-- stays as history and a new occurrence after acknowledgement opens a new row.
CREATE TABLE IF NOT EXISTS agent_alerts (
  id TEXT PRIMARY KEY,
  scheduler TEXT NOT NULL,
  code TEXT NOT NULL,
  agent TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('info','warning','critical')),
  cause_redacted TEXT,                     -- already redacted, max 500 chars
  affected_tasks_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(affected_tasks_json)),
  fallback_status TEXT,                    -- what the system does meanwhile (e.g. 'remaining tasks stay queued')
  recovery_state TEXT NOT NULL DEFAULT 'open' CHECK(recovery_state IN ('open','recovered')),
  recovered_at TEXT,
  last_run_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  action_token TEXT                        -- per-request nonce of the last owner transition (atomic audit guard)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_alerts_open ON agent_alerts(scheduler, code, agent) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_alerts_seen ON agent_alerts(acknowledged_at, last_seen_at);

-- Owner approval queue for side-effect autonomy tasks (paid media/photo generation). Never approved automatically; an approval is
-- one-shot for exactly one task and expires if unused.
CREATE TABLE IF NOT EXISTS agent_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  capability TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','used','expired')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  expires_at TEXT,
  used_at TEXT,
  note TEXT,
  action_token TEXT                        -- per-request nonce of the last transition (atomic audit guard)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_approvals_live ON agent_approvals(task_id) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS idx_agent_approvals_status ON agent_approvals(status, requested_at);

CREATE TABLE IF NOT EXISTS agent_versions (
  agent TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','previous','retired')),
  activated_at TEXT,
  activated_by TEXT,
  notes TEXT,
  PRIMARY KEY(agent, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_versions_active ON agent_versions(agent) WHERE status='active';

CREATE TABLE IF NOT EXISTS agent_heartbeat (
  scheduler TEXT PRIMARY KEY,
  last_run_id TEXT NOT NULL,
  last_finished_at TEXT NOT NULL,
  healthy INTEGER NOT NULL CHECK(healthy IN (0,1))
);
