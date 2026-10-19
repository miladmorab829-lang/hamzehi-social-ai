-- Stage 2B PRECHECK — SELECT only. Run each statement with: npx wrangler d1 execute DB --remote --command "<statement>"
-- (never --file: it reports changed_db:true even for SELECTs). Expected values verified read-only on 2026-10-19.

-- P1 no agent_* object exists yet. Expect 0 rows.
SELECT type,name FROM sqlite_master WHERE name LIKE 'agent\_%' ESCAPE '\' OR name LIKE 'idx_agent\_%' ESCAPE '\' OR name LIKE 'ux_agent\_%' ESCAPE '\';

-- P2 the audit target the owner actions write to has exactly these columns. Expect id,type,module,message,meta_json,created_at.
SELECT name FROM pragma_table_info('autonomy_events') ORDER BY cid;

-- P3 MEM-02/03/05 objects are present (migration order). Expect 3+ rows.
SELECT name FROM sqlite_master WHERE name IN ('ai_call_flights','sales_concept_cache','ux_inbox_messages_platform_external') OR name LIKE 'sales_memory\_%' ESCAPE '\';

-- P4 baseline counts to compare in the postcheck (record the output).
SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table') tables,(SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%') indexes,(SELECT COUNT(*) FROM sqlite_master WHERE type='trigger') triggers,(SELECT COUNT(*) FROM autonomy_tasks) tasks,(SELECT COUNT(*) FROM autonomy_events) events;
-- 2026-10-19 reference: 76 tables (incl. _cf_KV), 75 indexes, 17 triggers, tasks 9470, events 10656 (tasks/events grow normally).
