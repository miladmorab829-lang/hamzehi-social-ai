-- Read-only postcheck: the new code is allowed, row count unchanged (compare with the pre-run count), trigger and indexes present.
SELECT instr(sql,'processing_failed')>0 AS has_processing_failed FROM sqlite_master WHERE type='table' AND name='owner_escalations';
SELECT COUNT(*) AS rows FROM owner_escalations;
SELECT name FROM sqlite_master WHERE tbl_name='owner_escalations' AND type IN ('index','trigger') ORDER BY name;
