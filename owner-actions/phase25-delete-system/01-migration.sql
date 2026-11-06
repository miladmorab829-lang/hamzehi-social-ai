-- PHASE 25: Trash and cleanup store. LOCAL ONLY until the owner authorizes it for Production.
-- Additive: two new tables, no change to any existing table, no data moved.
-- Apply BEFORE deploying the Phase 25 code. Without these tables the cleanup API answers
-- migration_required and every existing dashboard view keeps working unfiltered.

CREATE TABLE IF NOT EXISTS cleanup_trash (
 id TEXT PRIMARY KEY,
 section TEXT NOT NULL,
 record_id TEXT NOT NULL,
 op_id TEXT NOT NULL,
 prior_json TEXT NOT NULL DEFAULT '{}',
 state TEXT NOT NULL CHECK(state IN ('trashed','restored','purged')),
 deleted_by TEXT NOT NULL,
 deleted_at TEXT NOT NULL,
 restored_by TEXT,
 restored_at TEXT,
 purged_by TEXT,
 purged_at TEXT
);
-- One live trash row per record: a double submit cannot trash the same record twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cleanup_trash_live ON cleanup_trash(section,record_id) WHERE state='trashed';
CREATE INDEX IF NOT EXISTS idx_cleanup_trash_section ON cleanup_trash(section,state,deleted_at);

CREATE TABLE IF NOT EXISTS cleanup_ops (
 id TEXT PRIMARY KEY,
 section TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('trash','restore','purge')),
 scope TEXT NOT NULL CHECK(scope IN ('ids','page','filter','section')),
 filter_json TEXT NOT NULL DEFAULT '{}',
 record_ids_json TEXT NOT NULL DEFAULT '[]',
 summary_json TEXT NOT NULL DEFAULT '{}',
 confirm_phrase TEXT,
 status TEXT NOT NULL CHECK(status IN ('previewed','running','done','failed')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 started_at TEXT,
 finished_at TEXT,
 result_json TEXT
);
-- One running operation per section: concurrent bulk actions on a section are refused.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cleanup_ops_running ON cleanup_ops(section) WHERE status='running';
