# PHASE 16.6 — Pre-deployment verification and release safety (READ-ONLY)

Date: 2026-10-28.
Method:
- Git;
- Wrangler 4.154.0, OAuth, account `d6820791…071c`: `deployments status|list`, `versions list|view`;
- `d1 execute --remote` with `SELECT` against `sqlite_master` / `pragma_table_info` only. No row data was read.

**Local only. Not committed or pushed.**

## 1. GitHub (verified)
- **Branch and HEAD:** branch `V10-codex-claude-integration`. Local HEAD = remote HEAD = `f02546c0fd9aed935999be368266e47eb333f1fb`.
- **Working tree:** no tracked changes. 57 untracked items, pre-existing and unrelated, left untouched.
- **Phase 16 checkpoints in history:** `c7bdc79` (16.1) → `cfc69fa` (16.2) → `4eab996` (16.3) → `5ad943b` (16.4) → `f02546c` (16.5).
- **Contents of `f02546c`:** exactly `tests/harness/phase16_5.mjs` + `PHASE-16-5-REPORT.md`.
- **Test result still valid:** no source change after the 661/661 run, so no re-run was needed.

## 2. Cloudflare Production (verified)
- **Active deployment:** `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` at **100 %** traffic, deployed 2026-10-23 08:13Z.
  - tag `7e8985c-orch-on`;
  - message "Phase 14 stabilization – orchestrator on".
- **Previous deployment (rollback reference):** `7d31d5fb-58c9-442d-b926-52aa43e5e676` (2bc1c92, Phase 13.1, orchestrator on).
- **`68aff866`:** exists, tag `c7bdc79-phase16-1-orch-on`, message "upload only – NOT DEPLOYED". **It is not deployed.**
- **Compatibility:** date `2026-09-11`, flag `global_fetch_strictly_public`. This matches `wrangler.toml`.

## 3. NEW FINDING — automatic, untagged versions from Git pushes
`wrangler versions list` shows **5 untagged versions with no message** after `68aff866`. Each one was created 25–40 s after a push to this branch. The inference is that the branch is connected to Cloudflare Workers Builds, so every push uploaded (did **not** deploy) a version.

| Push (commit, UTC) | Version | Created (UTC) |
|---|---|---|
| `c7bdc79` 21:12:59 | `925196e1-4db7-478e-95d2-73fc2baca932` | 21:13:28 |
| `cfc69fa` 21:51:03 | `d9a51603-b7d3-4657-8426-ad886723f72e` | 21:51:34 |
| `4eab996` 22:00:29 | `51b22354-314c-4c68-83a3-30dd603013a2` | 22:01:05 |
| `5ad943b` 22:15:01 | `39b7e425-5442-4ab5-9f86-dad9816fb0b4` | 22:15:38 |
| `f02546c` 22:25:52 | `99c203a3-74ec-4403-ade5-b6c0643263c3` | 22:26:16 |

Consequences:
- **No orchestrator flag:** these builds **lack `AUTONOMY_ORCHESTRATOR=on`**. `wrangler.toml` does not set it; it was always passed with `--var` at upload. Deploying any of them would switch the orchestrator **off**, and the Phase 16.4 `watchdog_missed` check would never run. **Never deploy an untagged version.**
- **Shared bindings and secrets:** they use the **production** D1, R2 and secrets. If preview URLs are enabled, their `fetch` handler is reachable. Admin routes still need `ADMIN_TOKEN`. Crons run only on deployed versions. This is the known item J3 (owner decision).
- **Earlier reports were incomplete:** the 16.1–16.5 reports said "no upload". That was true for manual commands, but each push caused an automatic build upload. Nothing was deployed and traffic stayed 100 % on `5256ded0`.
- **Not verified:** the Workers Builds settings themselves (they are not readable through the read-only Wrangler commands used here).

## 4. D1 compatibility (verified, read-only)
- **Objects present:** 82 tables and 82 indexes.
- **Required tables, all present:**
  - the 6 agent-ops tables: `agent_runs`, `agent_dead_letters`, `agent_alerts`, `agent_heartbeat`, `agent_approvals`, `agent_versions`;
  - `ai_call_flights` (MEM-02);
  - `retry_queue`;
  - the order, payment, lead, inbox, memory, outreach, autonomy, price, escalation and approval tables.
- **Indexes:** `ux_agent_alerts_open` exists. This is the unique index the 16.4 race-safe `raiseAlerts` relies on. The others are also present: `ux_agent_approvals_live`, `ux_agent_versions_active`, and the `ai_call_flights` indexes.
- **Columns used by the 16.x code:** retry_queue 10/10, agent_alerts 15/15, agent_heartbeat, agent_versions, lead_order_payments, lead_orders (cancel fields), leads and autonomy_tasks. **None missing.**
- **Conclusion:** **no D1 migration is required** for `f02546c`.

## 5. Bindings and configuration
| Item | Production `5256ded0` / `68aff866` | Git build `99c203a3` | Code expectation for `f02546c` |
|---|---|---|---|
| `DB` | D1 `40b272c5…` | same | same |
| `GALLERY_BUCKET` | R2 `hamzehi-gallery` | same | same |
| `AI` | Workers AI | same | same |
| `SALES_AI_PROVIDER` / model | anthropic / `claude-opus-5-5` | same | unchanged policy |
| `SALES_AI_TIMEOUT_MS` | 15000 | 15000 | clamped ≤15 s, unchanged |
| `AUTONOMY_ORCHESTRATOR` | **on** (`68aff866` has it; `5256ded0`'s tag is `orch-on`) | **missing** | must be passed: `--var AUTONOMY_ORCHESTRATOR:on` |
| `SALES_AI_PROVIDER_COOLDOWN` | not set | not set | unset = **cooldown ON** (new behaviour) |
| `SALES_AI_MAX_OUTPUT_TOKENS` | not set | not set | unset = **no cap** (unchanged requests) |
| Secret names | `ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `KLING_API_KEY`, `OPENAI_API_KEY`, `SHOTSTACK_API_KEY`, `TELEGRAM_BOT_TOKEN` | same | no new secret needed (values not read) |

**Exact production behaviour of the cooldown, with this config:**
- **Trigger:** Anthropic answers 429, 401 or 403.
- **Duration:** that Worker isolate skips the Sales-AI call for 30 s (429) or 120 s (401/403).
- **Effect during the window:** messages get the deterministic path or owner hold, exactly as on any AI failure today.
- **Scope:** other isolates are not affected.
- **What it never does:** retry, switch provider or switch model.
- **When it is inactive:** with no such errors, behaviour is identical to before.
- **To disable:** add `--var SALES_AI_PROVIDER_COOLDOWN:off` at upload. This is an owner choice; it is compatible either way.

## 6. Release candidate `f02546c`
- **Tests:** 661/661 locally (mock world), still valid. **No migration**, **no new binding or secret**.
- **Behavioural changes vs Production (`7e8985c`):**
  - 16.1: existing orders no longer hijack sales questions; mixed status+sales messages are held; Iraqi prefixes; mixed-market destinations undecided; cancellation blocked once a payment or shipment exists.
  - 16.2: mixed intent held; follow-up scan beyond 500 leads; currency/market guard on revenue drafts.
  - 16.3: «بطهران»-type mixed-market detection; owner reschedule re-drafts the follow-up.
  - 16.4: race-safe alerts, `watchdog_missed`, incident state, retry permanent/stale classification, rollback eligibility, Sales-AI cooldown, optional token cap.
- **Rollback prerequisites:** rollback is a traffic switch back to `5256ded0` (no schema dependency); `7d31d5fb` is the next fallback. Do **not** deploy #465/#467/#469 or any untagged Git build.

## 7. Release blockers
1. **Owner approval required** for the upload and for the deployment (separately).
2. **Live Telegram verification not yet done** (Phase 15 P1). It needs a deployed version (the Telegram webhook targets Production) and a fresh test account in a monitored window.
3. **Untagged Git builds exist without the orchestrator flag.** Owner decision: disable Workers Builds for this branch (or keep it and never deploy untagged versions); also the preview URL exposure question (J3).
4. **Pending owner policies, kept blocked:** H1, H2, F3, I3, B3, C3, the mixed-intent clarification text, and the historical test-data classification (16.0). They are not required for this release, because the code keeps the safe defaults.

## 8. Proposed release sequence — NOT executed
Run from `worker/`, each step only after explicit owner approval.

**1. Upload without deploying.**
```
npx wrangler versions upload --var AUTONOMY_ORCHESTRATOR:on --tag f02546c-phase16-5-orch-on --message "Phase 16.1-16.5 f02546c upload only - NOT DEPLOYED"
```
Add `--var SALES_AI_PROVIDER_COOLDOWN:off` only if the owner rejects the cooldown.

**2. Verify the upload.**
```
npx wrangler versions view <NEW_VERSION_ID>      # tag, vars incl. AUTONOMY_ORCHESTRATOR=on, DB/R2/AI bindings, secret names
npx wrangler deployments status                  # must still show 5256ded0 @100%
```

**3. Rollout, owner choice.**
- **(a) Full switch in a monitored window (recommended).** Telegram has no version stickiness, so a split would answer one customer from two versions.
```
npx wrangler versions deploy <NEW_VERSION_ID>@100% --message "Phase 16.5 f02546c (orchestrator on)"
```
- **(b) Gradual.** Crons and webhooks then run on both versions.
```
npx wrangler versions deploy <NEW_VERSION_ID>@10% 5256ded0-4aab-4b5a-95c1-ccd7a1752a9a@90%
```

**4. Controlled Telegram test** with a fresh owner test account. No real customer is involved.
- Persian price question → approved TOMAN answer or owner hold.
- Iraqi «أريد التوصيل لكربلاء» → ARAB/USD.
- «عندي محل ببغداد وفرع بطهران» → market undecided.
- A customer with an order: «سفارشم کجاست؟» → status; «جعبه ساعت دارید؟» → sales; both together → held + one acknowledgement.
- Confirm that no follow-up and no payment message was sent automatically.

**5. Monitoring (read-only), first 24 h.**
- `GET /api/autonomy/agents/overview`: watchdog and orchestrator heartbeats fresh; no new critical alert; `rollback` list present.
- `sales-brain` events: watch the rate of `provider_cooldown` / `provider_*` errors.
- `scheduled_step_failed` events.
- `npx wrangler tail` (logs only) during the test window.

**6. Rollback, if needed** (owner-approved; no schema dependency):
```
npx wrangler versions deploy 5256ded0-4aab-4b5a-95c1-ccd7a1752a9a@100% --message "Rollback to Phase 14 (orch on)"
```

## 9. Operations NOT performed
- version upload;
- deploy;
- traffic change or rollback;
- D1 write, migration or any non-`SELECT` statement; customer rows were not read;
- secret, binding, route, domain, cron or R2 change;
- secret values (only names, as Wrangler prints them);
- Telegram message;
- paid AI call;
- owner approval;
- Git commit or push;
- access to the protected original.

Phase 16.7 is not started.
