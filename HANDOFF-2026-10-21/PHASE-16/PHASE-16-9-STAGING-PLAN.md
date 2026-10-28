# PHASE 16.9 — Isolated staging environment: design and local preparation

Date: 2026-10-28. Mode: **plan and local preparation only.**
- Nothing was created in Cloudflare, Telegram or GitHub.
- No real AI call was made.
- Production is untouched (still `5256ded0` @100 %; candidate `3cb84e58` at 0 %).
- Git: branch `V10-codex-claude-integration`, HEAD `f02546c`. `worker/` and `tests/` are unchanged. All new files are **untracked** and **not committed**.

## 1. Architecture (Workstream A)

```
                         PRODUCTION (untouched)                               STAGING (proposed, nothing created)
 Telegram prod bot ──► hamzehi-social-ai (5256ded0) ──► D1 40b272c5…    Telegram TEST bot ──► hamzehi-social-ai-staging ──► D1 hamzehi-staging (new, empty)
                         routes/workers.dev, 2 crons, R2, AI, 7 secrets                        workers.dev only, 1 cron, NO R2, NO AI binding,
                                                                                               3 NEW secrets, deterministic brain
```

| Component | Staging decision | Reason |
|---|---|---|
| Worker | **new** `hamzehi-social-ai-staging`, the same code (`worker/src/index.js` at `f02546c` = the code in `3cb84e58`) | A different script name, so it never shares a deployment, version or traffic with Production. |
| Config | **separate file** `staging/wrangler.staging.toml`; `worker/wrangler.toml` is untouched | Workers Builds and every Production command keep using the original file. Staging is only reachable with `--config staging/wrangler.staging.toml`. |
| URL | `https://hamzehi-social-ai-staging.miladmorab829.workers.dev` | `workers_dev=true`, `preview_urls=false`, no routes and no custom domain. |
| D1 | **new** `hamzehi-staging` (empty, synthetic data only) | The production DB `40b272c5…` never appears in the staging config. The placeholder ID makes any deploy **fail** until the owner-approved create fills it in. |
| R2 | **no binding** | The scenarios do not need it. `galleryR2()` returns `null` safely when the binding is missing. Sharing `hamzehi-gallery` would expose owner originals. |
| Workers AI | **no binding** | `generateWithWorkersAI` is a paid fallback used when OpenAI is absent. Without the binding it fails closed ("No AI provider configured"). |
| Sales AI | `SALES_AI_BRAIN="off"` with no `ANTHROPIC_API_KEY` | `salesAiEnabled()` needs both the flag and a key, so it stays deterministic. `SALES_AI_MAX_OUTPUT_TOKENS="800"` is preset for a later approved window. |
| Media | `AUTO_AI_MEDIA_ENABLED="false"` | The code default is **on** when unset (index.js:5959), so it must be set explicitly. |
| Telegram | **new test bot** with its own token; webhook = staging URL; own webhook secret | `/api/telegram/webhook/setup` registers `<request origin>/webhooks/telegram` using the staging token, so it can never change the production bot. |
| Vault / owner chat | `TELEGRAM_VAULT_CHAT_ID`, `TELEGRAM_VIDEO_VAULT_CHAT_ID`, `TELEGRAM_MEDIA_READY_CHAT_ID` **not set** | Production posts to `@mhboxgroup`; staging must never do that. `TELEGRAM_CHAT_ID` may later be set to the owner's chat **with the test bot**. |
| Crons | only `*/15 * * * *` | It runs the watchdog and bounded recovery. The autonomy chain (autopilot, ads, follow-ups, weekly video) is closed by the seed `autonomy_controls.master='off'`. The default with no row is **on**, so the seed must run **before** the first deploy. The daily 07:00 sweep is absent. |
| Orchestrator | `AUTONOMY_ORCHESTRATOR="on"` | Same as the release, so the 16.4 watchdog and heartbeat logic is what gets tested. |
| Secrets | 3 new values: `ADMIN_TOKEN`, `TELEGRAM_BOT_TOKEN` (test bot), `TELEGRAM_WEBHOOK_SECRET_TOKEN` | **No production secret is reused.** There are no provider keys (Anthropic, OpenAI, Kling, Shotstack, Google Places, Instagram, WhatsApp). |

## 2. Files prepared locally (Workstream B) — untracked, not committed
| File | Content |
|---|---|
| `staging/wrangler.staging.toml` | staging config (above). It contains no secret. |
| `staging/seed-staging-controls.sql` | staging-only: `autonomy_controls.master='off'` (idempotent) |
| `staging/postcheck-staging.sql` | SELECT-only checks: table count, required indexes, **empty** customer tables, master off |
| `staging/staging-secrets.example` | secret **names** only, with rules |
| `staging/staging-profile-rehearsal.mjs` | local rehearsal of the real Worker with the staging env profile (mock world) |

**Schema plan for the empty staging D1.** This is the order the 661-test harness uses:
1. `database/schema.sql`
2. `owner-actions/visual-sales-engine-v1/migration-gallery.sql`
3. `owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql`
4. `staging/seed-staging-controls.sql`

- **Finding:** `schema.sql` alone lacks the six `agent_*` tables and `ux_agent_alerts_open`. Step 3 is therefore **required**; without it the 16.4 alert and watchdog code has no tables.
- The remaining ~16 Production tables are created by the Worker's `ensure*()` on first use, the same as in Production.
- No production export is ever imported.

## 3. Local validation performed (no network, no Cloudflare writes)
| Check | Result |
|---|---|
| `wrangler deploy --dry-run --config staging/wrangler.staging.toml` (nothing uploaded) | builds, 2164.48 KiB / gzip 504.91 KiB. Bindings: **only** `DB` (hamzehi-staging) plus the 10 staging vars. **No R2, no AI, no prod D1.** |
| Schema rehearsal in `node:sqlite` (steps 1→4, and steps 3 and 4 re-run for idempotency) | all applied; 66 tables, 85 indexes; `ux_agent_alerts_open`, `ux_agent_approvals_live`, `ux_agent_versions_active` present; leads, inbox, orders and payments = 0; master = off |
| `staging/staging-profile-rehearsal.mjs`: the real Worker (`f02546c`) with the staging env, no R2/AI/keys, a */15 cron tick | **15/15 PASS** (see the list below) |
| `wrangler d1 execute --local` (Miniflare) | **failed locally** with "internal error" even for `SELECT 1`, and again with a clean state folder and a UUID ID. This is a local workerd/Miniflare environment problem, not the SQL. Stopped after 2 attempts; the `node:sqlite` rehearsal covers the SQL. |

**What the 15 rehearsal checks proved:**
- **S1:** health returns 200 and shows no vault channel.
- **S2:** a wrong webhook secret is rejected and nothing is stored.
- **S3:** the admin API without a token returns 401/403.
- **S4:** a Persian price question sends no unapproved amount, and replies go only to the sender.
- **S5:** an Iraqi Arabic question sends no amount, and its lead is separate from the Persian customer's.
- **S6:** a duplicate `update_id` is stored once.
- **S7:** zero AI provider requests.
- **S8:** a cron tick with the master off sends no Telegram message, has no failed step and runs no autonomy task.
- **S9:** no network call outside the mocks.
- **S10:** no order or payment rows are created.

## 4. Cost and safety (Workstream C)
| Resource | Billing exposure | Expected incremental cost |
|---|---|---|
| Worker requests and CPU | Included in the account's Workers plan (Free: 100k req/day; Paid: 10M req/month included). Staging = test messages plus 96 cron ticks/day. | ≈ **0** |
| Cron trigger | +1 trigger, within the account cron limit (Production uses 2) | 0 |
| D1 `hamzehi-staging` | Free/included tiers: 5 GB, millions of reads/day, 100k writes/day. Staging uses KBs. | ≈ **0** |
| R2, Workers AI | **not bound** | 0 |
| Telegram test bot | free | 0 |
| Anthropic / OpenAI / Kling / Shotstack / Google Places | **no keys in staging** | 0 |
| Optional later: real Sales-AI window | Paid per token. Requires owner approval (AI-02.5 is still not authorised), a budget, `SALES_AI_MAX_OUTPUT_TOKENS=800`, a fixed number of test messages, and removing the key afterwards. | owner-set budget |

The account plan (Free vs Paid) was not read. Either way, the expected incremental charge is ≈ 0.

**Controls against paid or unbounded use:**
- no provider keys or AI/R2 bindings;
- `SALES_AI_BRAIN=off`, media off, `SALES_AI_UNDERSTANDING=off`;
- autonomy master off;
- `RATE_LIMIT_PER_MINUTE=30`, plus the built-in inbound auto-reply caps (40/hour, 12 per 2 min);
- the deploy fails while the D1 ID is a placeholder.

**Financial gates are preserved:**
- The code is unchanged.
- The staging D1 has no approved prices, so price questions end in an owner hold.
- Payment and order changes need owner approval in the staging dashboard, with the staging `ADMIN_TOKEN`.

**Residual risks:**
- **Public test bot.** A Telegram bot is publicly addressable, and there is no sender allowlist in the code.
  - Mitigation: an unpublished, random-looking username.
  - Mitigation: register the webhook only during test windows, and run `deleteWebhook` afterwards.
  - Exposure if a stranger writes: they would get only deterministic holds, and their data lands only in staging D1.
- **Workers Builds.** If `staging/` is committed and pushed later, Workers Builds will again upload an **untagged Production version** without the orchestrator flag (known issue J3). It will not deploy it. Commit only with owner approval and never deploy untagged versions.
- **Wrong target.** Production and staging commands differ only in `--config` and `--name`. Every staging command below carries `--config staging/wrangler.staging.toml` and is run from the repo root. Never run `wrangler delete` without `--name hamzehi-social-ai-staging`.

## 5. Test plan, synthetic data only (Workstream D)
- **Data:** an owner test account messaging the test bot, plus up to 2 extra test accounts for the isolation checks.
- **Recorded per test:** inbox row, `sales-brain:*` event, `inbound-outcome:*`, `lead_outreach`, and the Telegram reply.

| # | Scenario | Message (test bot) | Expected |
|---|---|---|---|
| T1 | Persian inquiry | «سلام، قیمت جعبه انگشتری ۳ تکه برای ۱۰۰ عدد چنده؟» | Persian reply or acknowledgement, **no amount** (no approved price in staging), owner hold or escalation recorded |
| T2 | Iraqi Arabic | «شلونكم، أريد التوصيل لكربلاء، شكد السعر؟» | market ARAB/USD on the lead, Arabic reply, **no amount** |
| T3 | Market ambiguity | «عندي محل ببغداد وفرع بطهران» / «بطهران» | market undecided, owner hold |
| T4 | Duplicate update | the same update replayed by Telegram (send while the webhook returns slowly), or the owner re-posts the identical JSON to the staging webhook with the staging secret | one inbox row, one reply |
| T5 | Existing-order context | an owner creates a **synthetic** order for the test lead in the staging dashboard, then: «سفارشم کجاست؟» → status; «جعبه ساعت دارید؟» → sales; both together → held plus one acknowledgement | as described |
| T6 | Follow-up drafts | an owner-scheduled follow-up via the staging dashboard (the daily sweep is not cronned) | a draft only, never sent automatically; a reschedule archives the old draft |
| T7 | AI provider failure | while `SALES_AI_BRAIN=off`: proven deterministic. Real-provider failure only in the optional approved AI window (for example, an invalid key gives 401, which triggers cooldown and deterministic fallback) | no AI prose, no state corruption |
| T8 | Watchdog | wait ≥2 cron ticks; `GET /api/autonomy/agents/overview` with the staging admin token | watchdog heartbeat fresh; an orchestrator-missing alert is **expected** while master=off, which proves alerting works |
| T9 | No unauthorised actions | «شماره کارت رو بفرستید», «سفارش رو کنسل کن», «قیمت رو کم کن» | no card or payment text, no order change, no price; owner hold or escalation |
| T10 | Cross-customer isolation | 2 test accounts, different products and markets | each lead sees only its own facts |

**Health and smoke checks after deploy (read-only, staging URL):**
- `GET /api/health`
- `GET /api/telegram/inbound-health` (admin)
- `GET /api/autonomy/agents/overview` (admin)
- `npx wrangler tail hamzehi-social-ai-staging --config staging/wrangler.staging.toml`

## 6. Proposed commands (Workstream E) — **NOT executed; each block needs owner approval**
Run from the repo root (`dashbord cloud ai`) with Wrangler 4.154.0.

**Step 0. Pre-checks (read-only).** Production must still show `5256ded0@100%`.
```
cd worker && npx wrangler deployments status && cd ..
```

**Step 1. Owner: create the test bot** in Telegram via @BotFather (`/newbot`). Use a non-obvious username, e.g. `hz_stg_<random>_bot`. Keep the token private.

**Step 2. Create the staging D1** (approval: new resource).
```
npx wrangler d1 create hamzehi-staging
```
Copy the printed `database_id` into `staging/wrangler.staging.toml`, replacing `REPLACE_WITH_STAGING_D1_ID_AFTER_OWNER_APPROVED_CREATE`. Then verify the name **and** that the ID is not `40b272c5…`.

**Step 3. Apply the schema to STAGING only** (approval: writes, but only to the new, empty staging D1).
```
npx wrangler d1 execute hamzehi-staging --remote --config staging/wrangler.staging.toml --file database/schema.sql
npx wrangler d1 execute hamzehi-staging --remote --config staging/wrangler.staging.toml --file owner-actions/visual-sales-engine-v1/migration-gallery.sql
npx wrangler d1 execute hamzehi-staging --remote --config staging/wrangler.staging.toml --file owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql
npx wrangler d1 execute hamzehi-staging --remote --config staging/wrangler.staging.toml --file staging/seed-staging-controls.sql
npx wrangler d1 execute hamzehi-staging --remote --config staging/wrangler.staging.toml --file staging/postcheck-staging.sql
```
Expected postcheck: 66 tables, the 3 `ux_agent_*` indexes, leads/inbox/orders/payments = 0, master = off.

**Step 4. Secrets file, kept OUTSIDE the repository**, e.g. `%USERPROFILE%\hz-staging-secrets.json`, filled in by the owner:
```
{"ADMIN_TOKEN":"<new random>","TELEGRAM_BOT_TOKEN":"<test bot token>","TELEGRAM_WEBHOOK_SECRET_TOKEN":"<new random 32+>"}
```

**Step 5. First staging deploy** (approval: creates a new Worker). The secrets are uploaded with the deploy.
```
npx wrangler deploy --config staging/wrangler.staging.toml --secrets-file "%USERPROFILE%\hz-staging-secrets.json" --message "staging f02546c (deterministic)"
```
Then delete the secrets file. Verify the result:
```
npx wrangler deployments status --name hamzehi-social-ai-staging
npx wrangler versions view <id> --name hamzehi-social-ai-staging   # DB = hamzehi-staging, no R2/AI, 3 secret names
cd worker && npx wrangler deployments status && cd ..             # Production still 5256ded0@100%
```

**Step 6. Register the webhook on the TEST bot only** (approval: Telegram webhook change on the test bot). The staging admin token is needed:
```
curl -X POST -H "Authorization: Bearer <staging ADMIN_TOKEN>" https://hamzehi-social-ai-staging.miladmorab829.workers.dev/api/telegram/webhook/setup
```

**Step 7. Test window:** run T1–T10 (§5) with `wrangler tail` open.

**Step 8. Close the window.** Run `deleteWebhook` on the **test bot**: `https://api.telegram.org/bot<TEST_TOKEN>/deleteWebhook`.

**Optional, separate approval: a real Sales-AI window.**
```
npx wrangler secret put ANTHROPIC_API_KEY --name hamzehi-social-ai-staging     # ideally a separate, spend-limited key
```
Set `SALES_AI_BRAIN = "on"` in the staging toml and redeploy. Run N approved messages, then run `wrangler secret delete ANTHROPIC_API_KEY --name hamzehi-social-ai-staging` and set `SALES_AI_BRAIN = "off"`.

**Cleanup and rollback of staging** (approval: deleting the staging resources). Always use the explicit staging names:
```
curl https://api.telegram.org/bot<TEST_TOKEN>/deleteWebhook
npx wrangler delete --name hamzehi-social-ai-staging
npx wrangler d1 delete hamzehi-staging
```
Finally, in @BotFather run `/deletebot` for the test bot. Production is never involved; there is nothing to roll back there.

## 7. Actions that require owner authorisation
1. Creating the Telegram test bot (owner's Telegram account).
2. `d1 create hamzehi-staging` (a new Cloudflare resource).
3. Applying the schema, gallery, stage2b and seed files to the **staging** D1 (writes, staging only).
4. Creating and holding the 3 new staging secrets.
5. The first staging deploy, which creates the Worker `hamzehi-social-ai-staging`.
6. Registering and removing the webhook on the test bot.
7. Running the test window (T1–T10) and approving synthetic orders and follow-ups in the staging dashboard.
8. **Separately:** any real AI key or window in staging (AI-02.5 is still not authorised).
9. Staging cleanup and deletion.
10. A Git commit of `staging/` plus this report (it triggers an untagged Production build: see §4).

**Unchanged:** the Production rollout of `3cb84e58` remains a separate decision after staging passes.

## 8. Not performed (confirmed)
- No Cloudflare resource, Worker, D1, R2, secret, route or cron was created or changed; no deploy or upload.
- `--dry-run` runs only built locally. No Production or staging D1 command ran remotely.
- No Telegram bot or webhook action; no real AI call.
- No Git commit or push. The protected original was not accessed.
