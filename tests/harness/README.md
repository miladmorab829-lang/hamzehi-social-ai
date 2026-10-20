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

Test-only values (`tok`, `bot-test`, `sec`, `test-key-not-real`, `test-places-key`, `test-openai-not-real`, `*.example`, `w.test`) are not
credentials. Never put real keys or customer data in these files.
