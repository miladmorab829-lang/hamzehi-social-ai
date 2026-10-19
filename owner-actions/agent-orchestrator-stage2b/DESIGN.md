# Agent orchestrator — Stage 2B storage design (DRAFT, NOT APPLIED)

Status: design only. Nothing here exists in Production D1. Applying `02-migration-draft.sql` needs owner approval, a precheck,
a backup/restore point and a postcheck, exactly like MEM-02/03/05.

## What Stage 2A already does (local, flag OFF by default)
- `worker/src/agent-orchestrator.js`: bounded task graph (parallel/sequential/`after`, timeouts, bounded retries, dedup,
  limits, deny-by-default capabilities, redaction) returning a redacted run report.
- `worker/src/autonomy-engine.js`: `runTasks` uses it only when the Worker var `AUTONOMY_ORCHESTRATOR` is exactly `"on"`;
  otherwise the original sequential loop runs unchanged. The run summary goes to the existing `autonomy_events` table as one
  allow-listed `orchestrator_run` row (no new table).

## Stage 2B tables (draft)
| Table | Purpose | Written by | Read by |
|---|---|---|---|
| `agent_runs` | one row per orchestrated run: run_id, version, started/finished, duration, counts JSON, budget, alert codes | runTasksOrchestrated | dashboard, watchdog |
| `agent_dead_letters` | failed/timed-out tasks after retries: task_id, agent, version, state, attempts, redacted error, resolved_at/by | runTasksOrchestrated | dashboard (owner retry/dismiss) |
| `agent_alerts` | persistent alerts until acknowledged: level, code, run_id, first/last seen, count, acknowledged_at/by | orchestrator + watchdog | dashboard |
| `agent_versions` | which version of each agent is active; previous version kept for rollback | owner action only | orchestrator, dashboard |
| `agent_heartbeat` | last successful run per scheduler (single row per key) | each run | watchdog |

## Watchdog (Stage 3, independent of the run it checks)
- A separate cron entry reads `agent_heartbeat`; if the last heartbeat is older than 2× the schedule, or the last run had a
  critical alert, it raises a persistent `agent_alerts` row (deduplicated by code). It never runs tasks itself.
- Alerts stay visible on the dashboard until the owner acknowledges them.

## Stage 2B status (local, 2026-10-19)
Implemented in code (inactive until the migration is applied AND the flag is on): `worker/src/agent-ops-store.js` (run reports,
dead letters, heartbeat, deduplicated alerts with agent/severity/timestamps/cause/affected tasks/fallback/recovery state, owner
approval queue — one-shot, bound to task id + payload, 24 h expiry), admin routes `/api/autonomy/agents/*`, dashboard page
`/dashboard/agents`, constant-time admin-token check (`worker/src/secure-compare.js`), redacted errors in autonomy-engine.js.
The draft migration now also contains `agent_approvals` and the extended `agent_alerts` columns.

## Next stage (Stage 3) — still to build
- Independent watchdog (separate cron entry reading agent_heartbeat; raises a critical alert when the scheduler is silent).
- Agent version registry + rollback via `agent_versions` (owner action only).
- Quality evaluation per agent (success rate, timeouts, retries trend) with thresholds that raise alerts.
- Resource/cost controls: per-day budget caps and an automatic pause (flag-off equivalent) when exceeded.

## Rules carried over
- Errors are redacted before any write; summaries are allow-listed and size-capped.
- side_effect actions (paid generation, anything customer-facing) are never run by the orchestrator; they need the owner
  approval queue (Stage 2B dashboard item) before the flag is turned on.
- Rollback = switch the flag off (no data change) or `npx wrangler rollback` for code; the draft tables are additive only.
- Open items before turning the flag on: owner approval queue for blocked side-effect tasks; constant-time admin-token compare;
  redaction of the existing `task_failed` event text on the OFF path (autonomy-engine.js original loop).
