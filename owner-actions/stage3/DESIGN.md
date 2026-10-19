# Stage 3 — foundation design (2026-10-20, local, nothing implemented beyond Phase 01 Block A)

Principle: reuse the Stage 2B ops store (already migrated in Production: agent_runs, agent_dead_letters, agent_alerts,
agent_approvals, agent_versions, agent_heartbeat). No duplicate DLQ, alert system, approval queue or Control Center. Monitoring runs
independently of the operational agents and costs no AI/API calls. Owner approval only for financial decisions.

## Phase 01 Block A — done locally
Atomic daily quotas: `claimTask` in autonomy-engine.js is a single D1 UPDATE (queued → running) that, for paid actions, only matches
while `SUM(attempts)` started today (UTC) for that module:action is below the cap. Used by the orchestrated and legacy paths (cron,
admin `/api/autonomy/tasks/run`, retries, dead-letter requeues). Refusal → task deferred to the next UTC day, no approval, no dead
letter. No schema change.

## 1. Independent watchdog + heartbeat (no migration)
- Input: `agent_heartbeat.last_finished_at/healthy`, `agent_runs` (last N runs), `autonomy_tasks` stuck in `running` > 15 min.
- Trigger: the existing daily `0 7 * * *` cron plus a cheap check at the start of the `*/15` tick that runs BEFORE and independently of
  `runAutonomyScheduled` (separate `ctx.waitUntil`, own try/catch) — a crashing agent cannot silence it.
- Output: `agent_alerts` codes `heartbeat_missed` (critical after 2 missed ticks), `task_stuck`, `run_unhealthy`, with the existing
  open → recovered → acknowledged lifecycle. These codes do not exist yet; once raised at level critical they would appear on the
  main dashboard through the existing rule that shows unacknowledged critical agent_alerts.
- Recovery: none automatic beyond the existing stale-lock release; the watchdog only reports.

## 2. Durable DLQ + controlled recovery (no migration)
- Keep `agent_dead_letters`; dead letters map back to `autonomy_tasks.id` (payload stays in the task row), so a requeue needs no
  payload column.
- Add bounded auto-recovery for READ tasks only (max 1 automatic requeue per task per day, recorded as resolution `auto_retried`).
  Paid/draft tasks stay owner-requeued (one click in the Control Center; still quota-limited by Block A).
- Dedupe dead letters per (task_id, day) to stop repeated identical rows.

## 3. Agent version tracking + safe rollback (table exists, unused)
- On each run, upsert the active `agent_versions` row per agent (`autonomy-engine` + ORCHESTRATOR_VERSION); keep `previous` rows.
- Per-version success rate from `agent_runs.counts_json`. "Rollback" = owner-approved switch of the active version for
  config-level agents (prompt/limits); code rollback stays a Worker version deploy (existing procedure, owner approval).

## 4. Output-quality evaluation (needs a small table — migration draft later)
- Deterministic signals only, no extra AI calls: `routineContentIssues` / `salesAiProseIssues` hits, `content_auto_approve_held` vs
  `content_auto_approved`, owner rejections in `approval_queue`, `lead_identity_conflict`, task failure / dead-letter rate.
- Proposed `agent_quality_evals(id, agent, version, window_start, window_end, samples, score, signals_json, created_at)` — daily
  aggregate rows (tiny). Draft only; owner approval + backup/precheck/postcheck before any Production migration.

## 5. Resource budgets, API cost and performance (no migration)
- In Production: per-run budget units and run duration in `agent_runs`, daily quotas (count-based check). The atomic quota claim
  (Block A) is local only until committed and deployed.
- Add: per-day cost units per agent derived from `autonomy_tasks` attempts × unit cost, shown in the Control Center; an
  `budget_daily_exceeded` alert and auto-pause of PAID capability (not read/draft) when the owner-set daily unit budget is reached.
- Paid paths outside autonomy tasks (cron content autopilot, photo/video autopilot locks, ads autopilot cron, admin routes) keep their
  own limits; the Control Center lists their daily counts read-only. Ads autopilot has no daily cap today (per-run caps only) — open item.

## Dashboard policy
Main dashboard: critical agent failures, financial decisions, essential health only (already enforced; no new sections).
Agent Control Center: health, quotas, publishing, recovery, quality and cost details.

## Next checkpoints
1. Owner review → commit Block A (separate approval) → deploy (separate approval; flag stays ON).
2. Phase 02: watchdog (1) + DLQ dedupe/read auto-recovery (2) — code only.
3. Phase 03: version tracking (3) + cost view/auto-pause (5).
4. Phase 04: quality table migration draft (4) → owner-approved migration.
