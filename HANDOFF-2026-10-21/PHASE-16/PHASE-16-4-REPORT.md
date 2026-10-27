# PHASE 16.4 — Operational resilience, agent recovery, AI cost protection: report and handoff

Date: 2026-10-28 · Branch `V10-codex-claude-integration` · base `4eab996` (Phase 16.3).
No Cloudflare upload or deploy. No D1 access, no migration or schema change, no new table, binding, queue or paid resource. No customer message, no paid API call. Production was not queried.
Note: the owner's Phase 16.4 brief was cut off inside Workstream E. Scope executed: workstreams A–E as far as visible, plus the standing checkpoint and handoff rules.

## Baseline found (already in place, reused)
- **Watchdog:** independent `waitUntil` on the */15 cron. It checks heartbeat, stuck tasks, repeated failures, dead letters and version health.
- **Alerts:** one open row per incident, with occurrences, first/last seen, cause, fallback and the recovered/acknowledged lifecycle. Durable incident history therefore exists without a migration.
- **Dead letters:** read-only tasks are auto-retried once per day per task; owner re-queue / dismiss.
- **`retry_queue`:** `max_attempts`, exponential backoff capped at 1 h, atomic claim.
- **Sales AI:** 8 s timeout (bounded 1–15 s), single-flight per inbox message (MEM-02), and a fail-closed deterministic fallback.

## Fixes
| # | Workstream | Defect (evidence) | Fix |
|---|---|---|---|
| 1 | A | **Alert dedup race.** `raiseAlerts` did SELECT-then-INSERT against the open-alert unique index. Two overlapping runs threw `UNIQUE constraint failed`, aborting the Watchdog run before its heartbeat. Reproduced on the `4eab996` sources | `INSERT OR IGNORE`, then bump the winning row. Never throws; one row; every occurrence counted |
| 2 | A | **Nothing watched the Watchdog.** Its heartbeat was written but never checked | `recordRun` (orchestrator, independent of the Watchdog) raises a critical `watchdog_missed` when a Watchdog heartbeat exists and is older than 35 min. It is recovered by the existing lifecycle |
| 3 | A | **No transient vs sustained distinction** | `incidentState()`: transient, or sustained (3+ detections or 45+ min open), or recovered. Shown on each alert in the ops overview |
| 4 | B | **`retry_queue` retried permanent errors** (unsupported operation, missing record, bad payload) until `max_attempts` | Classified as `permanent:` and failed at once, with no next attempt |
| 5 | B | **A row left `running` by a crashed run stayed there forever, invisible** | After 30 min it is failed as `stale_running` for owner review. It is **never re-run** automatically, because it may be an outbound publish with an unknown outcome |
| 6 | C | **No explicit rollback eligibility** | `rollbackEligibility()`, read-only: eligible only if a previous version has ≥4 finished tasks with ≤50 % failed; otherwise `no_previous_version`, `insufficient_history` or `previous_version_unhealthy`. Action is always `owner_approved_worker_deploy_only`. Exposed as `rollback` in `/api/autonomy/agents/overview` |
| 7 | D | **After 429 / 401 / 403 every customer message called the provider again** | Provider cooldown per isolate: 429 → 30 s, 401/403 → 120 s. Returns `provider_cooldown`, which takes the same fail-closed path. No other provider or model and no retry. `SALES_AI_PROVIDER_COOLDOWN=off` disables it |
| 8 | D | **No per-request output-token budget on OpenAI** | Optional `SALES_AI_MAX_OUTPUT_TOKENS` (256–16000), **inactive unless set**. Anthropic's 8000 is unchanged by default. An OpenAI `incomplete` answer → `provider_truncated` (fail closed) |

## Changed files
- `worker/src/agent-ops-store.js`: `raiseAlerts`, `recordRun`, `incidentState`, `opsOverview`
- `worker/src/agent-watchdog.js`: `rollbackEligibility`
- `worker/src/autonomy-engine.js`: overview `rollback` field
- `worker/src/index.js`: `recovery()`, `retryErrorPermanent`, `failStaleRetryRuns`
- `worker/src/sales-ai-brain.js`: cooldown, optional token cap, incomplete handling
- `tests/harness/phase16_4.mjs`: new, 28 tests
- this report

## Tests
- phase16_4: 28/28. Against the pre-change sources the suite crashes with `UNIQUE constraint failed` in `raiseAlerts`, which confirms fix 1.
- Full local harness: **616/616 PASS** across 19 suites (588 + 28).
- Covered: agent timeout/stuck and recovery, duplicate incident suppression, overlapping runs, retry exhaustion / permanent failure / stale running, rollback eligibility, AI timeout, quota/auth failure and truncation.
- Concurrent duplicate AI requests per inbox are covered by the existing MEM-02 single-flight tests.

## Remaining risks / owner decisions
- **I3 (owner decision, not implemented):** Sales-AI daily spending cap. No threshold was invented.
- **F3, H1, H2, B3, C3:** unchanged owner decisions.
- **Cooldown state is per isolate,** not global: no new storage, by design. A global breaker would need `system_kv` or similar (owner decision).
- **Durable incident history:** `agent_alerts` (first/last seen, occurrences) already provides it. A separate incident-events table is not needed now; no migration was proposed.
- **New Watchdog alert for the owner to review:** `watchdog_missed` needs the orchestrator to be running (`AUTONOMY_ORCHESTRATOR=on`). The Watchdog itself still alerts when the orchestrator is missing (`heartbeat_missed`).
- **Still open:**
  - Phase 15 live Telegram verification, which needs an owner-approved upload/deploy.
  - Phase 16.0 test-data flags.

## Cloudflare / Production
- **Not performed:** upload, deploy, D1, route/secret/cron/binding changes.
- **Not verified in this phase:** that Production is `5256ded0` and that `68aff866` is the last upload. Both are as reported by the owner.

## Next recommended
An owner-approved `wrangler versions upload` of this checkpoint (no deploy), then the Phase 15 fresh-account Telegram test (Persian + Iraqi Arabic), then the owner's deploy decision. Phase 16.5 is not started.
