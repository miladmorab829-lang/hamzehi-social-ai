-- PHASE 25 rollback. Run ONLY after the Phase 25 code is no longer live.
-- WARNING: run the restore step first. Rows moved to Trash keep status 'trashed', 'archived' or a dismissed
-- resolution in their own tables; dropping cleanup_trash loses the record of their prior state.
-- Step 1: in the dashboard, restore everything in Trash that should return.
-- Step 2: confirm nothing is left:
--   SELECT section,COUNT(*) FROM cleanup_trash WHERE state='trashed' GROUP BY section;
-- Step 3: only then:
DROP INDEX IF EXISTS idx_cleanup_ops_running;
DROP TABLE IF EXISTS cleanup_ops;
DROP INDEX IF EXISTS idx_cleanup_trash_section;
DROP INDEX IF EXISTS idx_cleanup_trash_live;
DROP TABLE IF EXISTS cleanup_trash;
