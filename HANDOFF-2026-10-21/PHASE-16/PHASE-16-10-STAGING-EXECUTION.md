# PHASE 16.10 — Isolated staging infrastructure: controlled execution

Date: 2026-10-28 (UTC). Wrangler 4.154.0, OAuth, account **`d6820791a36995f6a396806978fe071c`** (the owner's account).
**Local only. Not committed or pushed.** Builds on [PHASE-16-9-STAGING-PLAN.md](PHASE-16-9-STAGING-PLAN.md).

## 1. Safety checkpoint (before any change) — passed
| Item | Result |
|---|---|
| Git | branch `V10-codex-claude-integration`; local HEAD = GitHub HEAD = `f02546c0fd9a…`; **0 tracked changes**; untracked = the pre-existing items plus the 16.8/16.9 reports and `staging/`, all preserved |
| Production | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @**100 %** (2026-10-23T08:13:35Z, tag `7e8985c-orch-on`); newest version `3cb84e58` (0 %). **As last verified.** |
| Name conflicts | no Worker `hamzehi-social-ai-staging`; no D1 `hamzehi-staging`. The 6 existing D1s and 73 Workers were left untouched. |

## 2. Cost gate — passed (with an inference, see the limits)
- **Plan:** not directly readable. `GET /accounts/{id}/subscriptions` returns an authentication error because the OAuth token lacks billing scope.
- **Inference (strong): Workers Paid is already active.**
  - Production D1 `40b272c5…` read **9,536,726 rows on 2026-10-28** (GraphQL `d1AnalyticsAdaptiveGroups`, partial day).
  - The Free plan hard-caps D1 at 5M rows read per day, so that volume would be impossible on Free.
- **Account usage (last 24 h):**
  - Workers requests: 128 in total, of which `hamzehi-social-ai` = 102 (≈ the 96 cron ticks).
  - Cron triggers in the whole account: 2 before this phase, 3 after.
- **Staging incremental usage:** 96 cron invocations per day, plus test requests, on a 1 MB D1. This is negligible against the included allowances: 10M requests/month, 25B rows read/month, 50M rows written/month, 5 GB storage. **Expected incremental cost: $0.**
  - Even under Free-plan limits, the creation costs nothing: the D1 count goes 6 → 7 of 10, and the cron count stays within 5.
- **Nothing billable was enabled:** no plan change, no AI Gateway, no Workers AI or R2 binding, no paid API key.
- **Side observation (Production, out of scope):** about 9.5M D1 rows read per day with almost no customer traffic means the cron path reads heavily. It is within the included allowance, but worth a later efficiency review (P2).

## 3. Isolation design applied
- **Config:** `staging/wrangler.staging.toml` is a separate file. `worker/wrangler.toml` is **unchanged** (`git diff` empty).
- **Worker:** `hamzehi-social-ai-staging`; `workers_dev=true`, `preview_urls=false`; **no routes or domains**.
- **Bindings:** **only `DB` → `hamzehi-staging`**. There is **no R2** and **no Workers AI**.
  - The application does not need either at startup: `galleryR2()` returns `null`, and `generateWithWorkersAI` throws "not configured", so both fail closed.
- **Vars:**
  - `HAMZEHI_ENVIRONMENT="staging"` (a marker only);
  - `SALES_AI_BRAIN="off"`, `SALES_AI_UNDERSTANDING="off"`, `AUTO_AI_MEDIA_ENABLED="false"`;
  - `AUTONOMY_ORCHESTRATOR="on"`, `SALES_AI_MAX_OUTPUT_TOKENS="800"` (inactive), `RATE_LIMIT_PER_MINUTE="30"`;
  - `PUBLIC_WORKER_BASE_URL` = the staging URL.
  - No vault or owner chat IDs.
- **Secrets: NONE.** No placeholder credentials were created.
  - Without `ADMIN_TOKEN`, every admin and autonomy route returns 401.
  - Without `TELEGRAM_BOT_TOKEN`, nothing can be sent to Telegram.
  - The Telegram webhook secret self-generates as a random value, so every inbound POST is refused.
- **Cron:** only `*/15 * * * *`. The autonomy master gate is `off` (seeded before the deploy), so autopilot, ads, follow-up drafting and weekly video do not run.
- **Code guards:** **no code change was needed.** Configuration plus the existing auth gates enforce every restriction, as the rehearsal shows.

## 4. Local validation before creation
- `staging/staging-nosecrets-rehearsal.mjs` (new) runs the real Worker code (`f02546c`) with the exact staging vars and **no secrets, no R2, no AI**. Result: **14/14 PASS**:
  - health 200;
  - 5 admin routes refused (401);
  - the webhook refused with no secret, a guessed secret and the harness secret;
  - no inbox row;
  - both cron schedules run no autonomy task;
  - **zero outbound network calls of any kind**;
  - zero AI requests;
  - no lead, order, payment or outreach rows.
- The 16.9 staging-profile rehearsal (15/15) also still applies.
- **Migration review:**
  - `database/schema.sql` (tracked, sha256 `ac6ae72b195b…`): CREATE statements and triggers only.
  - `owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql` (tracked, `b8dac85aeec3…`): additive only.
  - `staging/seed-staging-controls.sql`: one `INSERT OR REPLACE` of the master switch.
  - **`migration-gallery.sql` was NOT applied.** It is untracked and contains `DROP TABLE` plus a rebuild. A `node:sqlite` comparison showed that schema+stage2b+seed gives **the identical 168 objects** with or without it, and `visual_product_media` is identical with `'r2'` allowed, so it is redundant.

## 5. Executed actions (in order)
| # | Time (UTC) | Command (repo root unless noted) | Result |
|---|---|---|---|
| 1 | ~18:2x | `wrangler d1 create hamzehi-staging`, run from an empty scratchpad folder so no config could be auto-edited | ✅ created, region **WEUR**, ID **`cddc10c5-2232-4334-8d99-fedb52fbd12d`** (≠ production `40b272c5-e368-4c33-8a41-7c63db98d7e8`) |
| 2 | | edited **only** `staging/wrangler.staging.toml` (database_id) | Production `worker/wrangler.toml` unchanged |
| 3 | | target check (read-only): `d1 execute hamzehi-staging --remote --config staging/wrangler.staging.toml --command "SELECT COUNT(*)…"` | printed `hamzehi-staging (cddc10c5-…)`, 0 objects (empty) |
| 4 | | `… --file database/schema.sql` (the ID was re-checked in the config before each write) | 154 queries, OK |
| 5 | | `… --file owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql` | 13 queries, OK |
| 6 | | `… --file staging/seed-staging-controls.sql` | 2 queries, OK |
| 7 | | postcheck (SELECT only) | **66 tables, 85 indexes**; `ux_agent_alerts_open`, `ux_agent_approvals_live`, `ux_agent_versions_active` present; **0** customer rows; **master = off**; 1.05 MB |
| 8 | | `wrangler deploy --dry-run --config staging/wrangler.staging.toml` | bindings: `DB (hamzehi-staging)` plus vars only |
| 9 | 18:34:27 | guarded: `wrangler deploy --config staging/wrangler.staging.toml --name hamzehi-social-ai-staging --message "Phase 16.10 staging f02546c - deterministic, no secrets"` (the script aborted unless name = `hamzehi-social-ai-staging` and ID = `cddc10c5…`) | ✅ **version `bed3bccd-90da-423e-a73b-da9c93b0fc55`**, URL `https://hamzehi-social-ai-staging.miladmorab829.workers.dev`, schedule `*/15 * * * *` |

**No secret file and no `--secrets-file` were used.**

## 6. Post-creation verification (read-only)
| Check | Result |
|---|---|
| Staging Worker exists under the correct name | ✅ `hamzehi-social-ai-staging`, version `bed3bccd…`, handlers `scheduled`, `fetch` |
| Staging D1 has a unique ID | ✅ `cddc10c5-2232-4334-8d99-fedb52fbd12d` |
| No production D1 or R2 in the bindings | ✅ `versions view`: the **only** binding is `env.DB (cddc10c5-…)`; no R2, no AI |
| No production Telegram token | ✅ `wrangler secret list --name hamzehi-social-ai-staging` → `[]` (no secrets at all) |
| No active webhook | ✅ no bot token exists, so no webhook can be registered; `/api/telegram/webhook/setup` returns 401 without `ADMIN_TOKEN` |
| Cannot call paid AI | ✅ no `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Kling, Shotstack or Google keys; no AI binding; `SALES_AI_BRAIN=off` |
| Preview URLs | ✅ `previews_enabled:false` (staging and production) |
| Live HTTP | `GET /api/health` → 200 (`r2:false`, all vault flags false). `GET /api/autonomy/agents/overview` and `GET /api/orders` without a token → **401**. No webhook POST was sent. |
| No scheduled outbound actions | master `off`; only `*/15`; first live tick: see §6b |
| Production Worker and traffic | ✅ **unchanged**: `5256ded0` @100 % (deployment 2026-10-23T08:13:35Z); newest version still `3cb84e58`; Production schedules unchanged (`0 7 * * *`, `*/15 * * * *`, last modified 2026-10-08) |
| Production D1 | ✅ untouched: no command targeted `40b272c5…`. Every D1 command named `hamzehi-staging` with the staging config, and Wrangler printed `cddc10c5-…` as the target each time. |

### 6b. Staging cron: final safety check (owner request after 16.10)

**Baseline before the first tick** (read-only, 18:41:03Z; no tick had run since the 18:34 deploy):
- 66 tables;
- `conversation_customer_media` = 0, `system_events` = 0, `agent_heartbeat` = 0, `agent_alerts` = 0;
- leads + outreach + inbox = 0; master = `off`.
- `autonomy_tasks` does not exist yet. `ensure()` creates it at the first gate check, which also proves that no autonomy cycle had run.

**Static review of the staging `*/15` handler** (`worker/src/index.js` `scheduled`, unchanged code at `f02546c`):
| Step (runs before the gate) | Outbound possible? | Writes |
|---|---|---|
| `recover_stale_customer_media` (limit 3) | Only through `analyzeCustomerMedia` for stale rows in `conversation_customer_media`. There are **0 rows**, and none can arrive: inbound is impossible without a webhook secret or bot token. The paid Vision call also needs `OPENAI_API_KEY`, which is **absent**. | none with 0 rows |
| `reconcile_accepted_chat_offers` (limit 10) | no (D1 only; never sends) | none with 0 offers |
| `purge_ai_call_flights` | no | deletes expired rows from an empty table |
| `watchdog` (`agent-watchdog.js`) | **no `fetch` in the file** | staging D1 only: heartbeat and alert rows (an orchestrator-missing alert is expected while master = off) |
| gate → `autonomyMasterGate` | no | `CREATE TABLE IF NOT EXISTS` for the autonomy tables; returns **false** because master = `off`, so autopilot, ads, follow-ups, weekly video and autonomy tasks **do not run** |

**Network level:**
- no secrets, no AI or R2 bindings;
- the only binding is `DB` → `cddc10c5…`;
- even a code path that tried Telegram would have no token, and no paid-provider key exists.

**Conclusion from code and config:** the cron can only write small bookkeeping rows to the **staging** D1. It cannot send messages, call paid AI or touch Production.

**Live tick result:** see §6c.

**Procedure to disable the staging cron (prepared, NOT executed; it needs owner approval because it is a staging configuration change).**
Set `crons = []` under `[triggers]` in `staging/wrangler.staging.toml`, then run from the repo root:
```
npx wrangler triggers deploy --config staging/wrangler.staging.toml --name hamzehi-social-ai-staging
```
- This updates the staging triggers only, with no new code version.
- Verify afterwards: `GET …/workers/scripts/hamzehi-social-ai-staging/schedules` → `[]`; Production schedules unchanged.
- **Never** run `triggers deploy` from `worker/` and never without `--config staging/…` plus the `--name` above. Either would act on Production.

**Re-verified at 18:40Z (read-only):**
- staging D1 `cddc10c5-2232-4334-8d99-fedb52fbd12d` ≠ Production `40b272c5-e368-4c33-8a41-7c63db98d7e8`;
- staging secrets `[]`, meaning no Telegram token (production or other), no webhook secret and no AI keys;
- staging bindings: DB only (no R2);
- staging deployment `bed3bccd` @100 %;
- **Production `5256ded0` @100 %, unchanged**; newest Production version still `3cb84e58`.

### 6c. Live result of the first staging cron tick (18:45Z), verified read-only
**D1 state at 18:47:22Z:**
| Item | Result |
|---|---|
| Cron executed | **yes**: `agent_heartbeat` = `watchdog@2026-10-28T18:45:29.281Z / healthy=1` |
| Autonomy | `autonomy_tasks` table now exists (created by `ensure()` at the gate check) with **0 rows**; master still `off`, so the gate stayed closed |
| Failures | `scheduled_step_failed` = **0**; `system_events` = none; `agent_alerts` = none |
| Customer data | leads + outreach + inbox = **0** |
| D1 writes caused | only the watchdog heartbeat row plus `CREATE TABLE IF NOT EXISTS` for the autonomy tables, **all in staging D1 `cddc10c5…`** |

**Cloudflare analytics** (GraphQL `workersInvocationsAdaptive`, script `hamzehi-social-ai-staging`, 18:30–19:00Z):
- **4 invocations**, all `success`, 0 errors. These are the 3 safety HTTP GETs and 1 cron tick.
- **subrequests = 0**: **no outbound network call of any kind**, so no Telegram, no AI provider and no other external host.

**Side effects:** none beyond the staging bookkeeping row. There was no message, no paid AI call, no Production contact and no commercial action.

## 6d. Final safety verdict (16.10): **SAFE**
- The cron ran once, healthy, with zero outbound calls and writes confined to the staging D1.
- Every isolation check holds:
  - D1 ID differs from Production;
  - no secrets, tokens, webhook, R2 or AI;
  - Production `5256ded0` @100 % is unchanged.

## 6e. Staging cron DISABLED (owner authorisation, 2026-10-28 18:53Z)
**Pre-checks:**
- cwd = repo root (`git rev-parse --show-toplevel`);
- config = `staging/wrangler.staging.toml`;
- `name = "hamzehi-social-ai-staging"`;
- Wrangler 4.154.0 `triggers deploy` supports `--config`, `--name` and `--dry-run`. The command is marked experimental by Wrangler.

**Change:** only `staging/wrangler.staging.toml`, from `crons = ["*/15 * * * *"]` to `crons = []` (with a comment). Nothing else changed.

**Commands:**
- Guarded: the script aborted unless the name was the staging name and `crons = []`.
- Dry run: `wrangler triggers deploy --config staging/wrangler.staging.toml --name hamzehi-social-ai-staging --dry-run` → OK.
- Apply at 18:53:07Z: the same command without `--dry-run` → `Deployed hamzehi-social-ai-staging triggers (5.03 sec)`.
- **No code deploy:** the staging deployment is still version `bed3bccd-90da-423e-a73b-da9c93b0fc55` @100 %.

**Verification (read-only API):**
| Item | Result |
|---|---|
| Staging schedules | **`[]`** (empty) |
| Staging workers.dev / previews | `enabled:true`, `previews_enabled:false` (unchanged) |
| Production schedules | `0 7 * * *` and `*/15 * * * *`, `modified_on 2026-10-08T20:06:34Z`: **unchanged** |
| Production version and traffic | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @**100 %** (deployment 2026-10-23T08:13:35Z); newest version still `3cb84e58`: **unchanged** |
| D1, Telegram, AI, Git | no D1 command, no Telegram action, no AI call, no commit or push |

**Unresolved risks and limits (not safety blockers):**
- **(a) Cron: RESOLVED.** The staging cron is disabled (§6e). Staging now runs only on HTTP requests, and with no secrets every admin and webhook route returns 401.
- **(b) The plan is inferred**, not read from billing.
- **(c) Watchdog alert once 16.11 starts.** An orchestrator-missing alert may appear later while master = off. It stays in staging D1, and nothing is sent because there is no token.
- **(d) Phase 16.11 risk.** Adding the test-bot token and `ADMIN_TOKEN` changes the risk profile: that is the moment outbound Telegram becomes possible. It needs the owner's 16.11 approval.
- **(e) Cosmetic health flag.** `/api/health` reports `production:true` (hard-coded).

## 7. Known limitations
- **Plan:** inferred from usage, not read from billing (missing token scope). The owner can confirm under Dashboard → Workers & Pages → Plans.
- **Health marker:** `/api/health` on staging still says `"production": true` and `"version": "V6.8-control-center"`. Both are hard-coded and cosmetic; `HAMZEHI_ENVIRONMENT=staging` is visible in `versions view`. The code was not changed.
- **Not testable yet:** with no `ADMIN_TOKEN` and no bot token, the staging dashboard and the T1–T10 Telegram scenarios cannot run. This is intentional for this phase.
- **Local Miniflare D1** is still broken on this machine (16.9); it was not needed.

## 8. Not performed (confirmed)
- No Telegram bot was created or activated; no webhook was registered or changed; no Telegram message was sent.
- No secret was set (staging or Production); no AI credentials; no Anthropic or OpenAI call.
- No Production deploy, version upload, traffic, route, domain, cron or R2 change. `3cb84e58` was not deployed.
- No Production D1 access other than the read-only GraphQL usage analytics.
- No Git commit or push. The protected original was not accessed. Phase 16.11 was not started.

## 9. Next actions requiring owner approval
1. **Scoped Git checkpoint** (optional): `staging/` (no secrets in it) plus the 16.8, 16.9 and 16.10 reports.
   - Note: a push triggers an untagged Workers Builds upload for **Production** (`hamzehi-social-ai`), not deployed. Never deploy it.
2. **Phase 16.11 (live staging test):**
   - create the Telegram **test** bot (owner);
   - set the 3 staging secrets with `wrangler secret put … --name hamzehi-social-ai-staging`: new `ADMIN_TOKEN`, test-bot token, new webhook secret;
   - register the webhook on the test bot only;
   - run T1–T10 (16.9 §5);
   - run `deleteWebhook` afterwards.
3. **Optional, separate:** a real Sales-AI window in staging (AI-02.5 is still not authorised).
4. **Cleanup when finished:**
   - `wrangler delete --name hamzehi-social-ai-staging`
   - `wrangler d1 delete hamzehi-staging`
5. **The Production rollout of `3cb84e58`** remains a separate decision after staging passes.
