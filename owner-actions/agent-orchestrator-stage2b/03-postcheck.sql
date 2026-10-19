-- Stage 2B POSTCHECK — SELECT only, run each with --command (never --file).

-- Q1 expect 6 tables + 7 named indexes: agent_runs, agent_dead_letters, agent_alerts, agent_approvals, agent_versions, agent_heartbeat;
--    idx_agent_runs_started, idx_agent_dead_letters_open, ux_agent_alerts_open, idx_agent_alerts_seen, ux_agent_approvals_live,
--    idx_agent_approvals_status, ux_agent_versions_active.
SELECT type,name FROM sqlite_master WHERE (name LIKE 'agent\_%' ESCAPE '\' OR name LIKE 'idx_agent\_%' ESCAPE '\' OR name LIKE 'ux_agent\_%' ESCAPE '\') ORDER BY type,name;

-- Q2 action_token on the three owner-action tables. Expect 3 rows.
SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.name IN ('agent_dead_letters','agent_alerts','agent_approvals') AND p.name='action_token';

-- Q3 new tables are empty. Expect all 0.
SELECT (SELECT COUNT(*) FROM agent_runs),(SELECT COUNT(*) FROM agent_dead_letters),(SELECT COUNT(*) FROM agent_alerts),(SELECT COUNT(*) FROM agent_approvals),(SELECT COUNT(*) FROM agent_versions),(SELECT COUNT(*) FROM agent_heartbeat);

-- Q4 compare with precheck P4: tables +6, named indexes +7, triggers unchanged (verified on the local restored copy).
SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table') tables,(SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%') indexes,(SELECT COUNT(*) FROM sqlite_master WHERE type='trigger') triggers;
