-- Stage 2B ROLLBACK — DESTRUCTIVE for agent_* data only. Run ONLY with a separate owner approval, and ONLY after the Worker
-- runs with AUTONOMY_ORCHESTRATOR OFF (or on a version without agent-ops-store.js). The code degrades when these tables are
-- missing (opsAvailable probe), so dropping them does not break sales, orders, payments, CRM or MEM objects.
-- Loses: agent run history, dead letters, alerts, approvals (pending approvals simply disappear; their tasks stay 'blocked'
-- and need a manual decision). Audit rows in autonomy_events are kept. Full restore alternative: D1 Time Travel to the
-- bookmark recorded in the runbook (that ALSO reverts every other write made after it — sales data included).
DROP INDEX IF EXISTS ux_agent_versions_active;
DROP INDEX IF EXISTS idx_agent_approvals_status;
DROP INDEX IF EXISTS ux_agent_approvals_live;
DROP INDEX IF EXISTS idx_agent_alerts_seen;
DROP INDEX IF EXISTS ux_agent_alerts_open;
DROP INDEX IF EXISTS idx_agent_dead_letters_open;
DROP INDEX IF EXISTS idx_agent_runs_started;
DROP TABLE IF EXISTS agent_heartbeat;
DROP TABLE IF EXISTS agent_versions;
DROP TABLE IF EXISTS agent_approvals;
DROP TABLE IF EXISTS agent_alerts;
DROP TABLE IF EXISTS agent_dead_letters;
DROP TABLE IF EXISTS agent_runs;
