-- HAMZEHI Phase 12 content publishing: smallest ADDITIVE schema step. NOT APPLIED anywhere (local test harness only).
-- One new table. No ALTER, no DROP, no change to any existing table, row or approval history.
-- The Worker ALSO creates this table at runtime (CREATE TABLE IF NOT EXISTS in ensureContentApprovalStore) before every read or
-- write, so deploy order does not depend on this file; applying it first only makes the schema change explicit and reviewable.
-- Production execution requires explicit owner approval. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS content_approval_revisions (
  approval_id  TEXT PRIMARY KEY,      -- approval_queue.id of the owner's 'approved' decision
  content_id   TEXT NOT NULL,
  content_hash TEXT NOT NULL,         -- SHA-256 of {hook, body, caption, cta, hashtags, ready media} at approval time
  created_at   TEXT NOT NULL
);

-- Post-check (SELECT only):
-- SELECT name FROM sqlite_master WHERE type='table' AND name='content_approval_revisions';
-- SELECT COUNT(*) FROM content_approval_revisions;   -- expected 0 right after creation

-- Rollback (only with owner approval; the table holds only Phase 12 approval hashes):
-- DROP TABLE IF EXISTS content_approval_revisions;
