# Offline test harness (versioned copy)

Runs the real Worker (`worker/src/index.js`) in Node with `node:sqlite` standing in for D1. Telegram, AI providers, search engines,
websites and OpenAI are in-process mocks; nothing reaches Production D1, Telegram or a paid API. The real-AI evaluation mode of the
original external harness is disabled here (`makeWorld({realAi})` throws).

## Requirements
- Node.js 24+ (uses the built-in `node:sqlite`; no npm packages).
- Run from this folder; the repository root is resolved automatically (override with `REPO=...`, worker source with `SRC=...`).
- Uses only tracked repository files: `database/schema.sql`, `worker/src/*`, `owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql`
  and `fixtures/schema-pre-mem02.sql`. Optional modes (`MEM02_SCHEMA=migrated`) read `owner-actions/mem-02/02-migration.sql`.

## Run
```
cd tests/harness
node crmdisc.mjs
node vaultsender.mjs
node quotarace.mjs
node phase02.mjs
node adsquota.mjs
node phase04.mjs
node phase05.mjs
node phase06.mjs
node phase07.mjs
node phase08.mjs
node phase09.mjs
```
Each prints `<suite> → ALL PASS (n)` and exits 0, or lists the failing checks and exits 1. Run whole files (later checks build on
earlier ones) and avoid starting a run within a minute of 00:00 UTC (daily caps reset at the UTC day boundary).

## Expected results (2026-10-20)
| Suite | Checks | Covers |
|---|---|---|
| crmdisc | 7 | Google Places discovery never overwrites CRM data; duplicate identities |
| vaultsender | 9 | Telegram vault sender allow-list, channel identity, fail closed |
| quotarace | 11 | Atomic daily quota for paid autonomy tasks (concurrency, retries, requeue, UTC reset) |
| phase02 | 21 | Watchdog, dead-letter recovery, versions, quality, cost budgets |
| adsquota | 13 | Shared Ads run budget across cron/manual/autonomy, interval, UTC reset, CRM protection |
| phase04 | 44 | Contact backfill (dry run, idempotent), owner-approved first contact + pilot link, Ads target filter, evidence-based negotiation, funnel |
| phase05 | 30 | Agent Control Center: read-only per-agent activity endpoint, status vs liveness, NOT CONNECTED/BLOCKED rules, no polling, Watchdog alert de-duplication |
| phase06 | 27 | Watchdog unexpected inactivity (infrastructure vs idle by design), alert retention, dead-letter retry eligibility, version/rollback readiness, deterministic per-agent quality, quota/cost exposure |
| phase07 | 26 | Health model (technical/connection/activity/execution), rowid-floor time-bounded reads (Watchdog + Control Center), demo labelling, Persian errors/next action, security / Approval Gate, API compatibility |
| phase09 | 55 | Dual-market Ads (Phase 09.4) + CRM follow-up continuity (09.6) + three independent daily quotas ADS_IRAN_DISCOVERY / ADS_IRAQ_DISCOVERY / CRM_FOLLOWUP (09.7): IRAN/ARAB configs disabled by default, owner-approved enabling, per-market city lists and daily limits inside the global cap, legacy row ignored and preserved, CRM attribution (TOMAN/USD), UNKNOWN for historical leads, cross-market protection, per-market follow-ups and reporting, no scheduled Ads task or dead letter while disabled, other agents unaffected |
| phase08 | 21 | Watchdog monitoring coverage (per-expectation coverage, SQL aggregation, visible monitoring_coverage_gap), fail-closed activity reads, Phase 05–07 API compatibility, release safety (auth, test-token isolation, no secrets) |

Test-only values (`tok`, `bot-test`, `sec`, `test-key-not-real`, `test-places-key`, `test-openai-not-real`, `*.example`, `w.test`) are not
credentials. Never put real keys or customer data in these files.

## Local dashboard preview (DEMO data)
`node preview-server.mjs [port]` serves the real Worker on this harness at `http://127.0.0.1:8799/dashboard/agents` (admin token `tok`).
Demo data only, 127.0.0.1 only, every outbound request refused, no cron; each page carries a DEMO DATA banner and an `X-Data-Source: demo` header.
