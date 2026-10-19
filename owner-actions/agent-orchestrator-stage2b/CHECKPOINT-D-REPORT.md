# Checkpoint D — orchestrator activation (2026-10-19) — FAIL (stopped before activation, nothing changed)

Production remains version 31f56d86 (89c64f4) at 100%, AUTONOMY_ORCHESTRATOR OFF. No upload, no deploy, no D1 write.

## Pre-activation gate
- PASS: version/commit 31f56d86 = 89c64f4; Checkpoints A/B/C PASS; agent_* tables healthy; flag OFF (not in toml, version vars or secrets);
  no pending deployment; /dashboard/agents + auth verified in Checkpoint C; customer webhook/quote/order/payment path never calls runTasks.
- Mechanism understood: `wrangler versions upload --var AUTONOMY_ORCHESTRATOR:on` from the unchanged 89c64f4 tree creates a NEW version;
  rollback = `wrangler versions deploy 31f56d86-8fdb-40eb-8a41-8889ca32148c@100%`. A later toml-only deploy would drop the flag (fail-safe OFF).

## Blocker (owner requirement: "paid operations remain blocked without explicit owner approval")
- With the flag ON, "draft" tasks run without approval. Two of them spend money:
  - `content:generate_and_queue` → OpenAI text (+ OpenAI image edit when AUTO_AI_MEDIA_ENABLED is not "false"; it is "true").
  - `crm:lead_discovery` → Google Places (paid, up to 8 calls/run) + writes/updates `leads` and `lead_identities`.
- The cron scheduler never plans them, but an admin free-text goal can queue them. Fixing this needs a code change (classify both as
  `side_effect`), which Checkpoint D does not authorize. Activation was therefore not performed.

## Other findings (Production, read-only, 2026-10-19)
- autonomy master=on, all modules on, no action overrides. Tasks: 9363 completed, 106 failed, 1 queued.
- Stale state since 2026-09-29: queued `telegram:status` task d30b04c0… and a leftover `autonomy_locks` row (telegram, task 4bd46748…,
  not running). recoverStaleLocks only clears locks of running tasks, so the scheduler has planned nothing since 2026-09-29.
- Local simulation on today's Production backup:
  - flag ON as-is: the task stays queued, 0 executions, 0 network calls, but one false dead letter every 15 min (≈96/day) + 1 alert.
  - if the stale lock is cleared, flag OFF: the legacy loop runs `photo:photo_generate` automatically (paid photo autopilot call) —
    in September it ran 114 times (14 completed, 100 failed). The stale lock is currently what prevents this.
  - if the stale lock is cleared, flag ON: photo_generate is blocked for approval, but a new approval request is created every 15 min.
- Business rows unchanged throughout (leads 86, orders 3, payments 2, inbox 125).

## Recommended next step (each needs its own owner approval)
1. Code fix: classify content:generate_and_queue and crm:lead_discovery as side_effect; make recoverStaleLocks clear locks whose task is
   not running; dedupe dead letters per task; one photo_generate approval per day. Then test, commit (B), deploy flag OFF (C).
2. Re-run Checkpoint D. Do NOT clear the stale lock while the flag is OFF (it would unblock automatic paid photo generation).
