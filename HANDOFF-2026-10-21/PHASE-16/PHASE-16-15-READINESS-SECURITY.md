# PHASE 16.15 — Controlled resumption, agent safety and release readiness

**Date:** 2026-10-29. **Mode:** read-only verification + one minimal local fix. **Report:** local only, not committed.
Nothing was deployed, uploaded, committed or pushed. No D1, R2, secret, cron, Telegram or AI action. The protected original was not accessed.

## 1. Verified starting checkpoint
- Read first: `END-OF-DAY-2026-10-29.md` and `PHASE-16-14-C-STAGING-DEPLOYMENT.md`. No earlier phase was repeated.
- Every checkpoint value below was re-confirmed read-only and matches. **No unexpected change was found**, so source work was allowed to start.

## 2. Git and Cloudflare status
| Item | Expected | Observed |
|---|---|---|
| Branch | `V10-codex-claude-integration` | same |
| Local HEAD | `b29e9bf0cfe2fd9560c2adc64398df7af0f9eb4d` | same |
| Remote HEAD (`git fetch` → `FETCH_HEAD`) | same | same |
| Tracked changes at start | 0 | 0; no stash; no running git operation |
| Untracked items at start | 61 (+ the EOD file itself) | 62 (all earlier reports, `migration-plan/`, `owner-actions/`); all preserved |
| Production `hamzehi-social-ai` | `5256ded0` @100 % | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @100 %, tag `7e8985c-orch-on`; last deployment 2026-10-23T08:13:35Z |
| Staging `hamzehi-social-ai-staging` | `dfe1c2e0` @100 % | `dfe1c2e0-781e-412e-a478-769959c55483` @100 %; deployment 2026-10-29T07:15:08Z |
| Staging secrets | `[]` | `[]` |
| Candidate `837a8e6d` | 0 % | not in any deployment (0 %) |

- **Commands used (all read-only):**
  - `git rev-parse`, `git status --porcelain`, `git fetch origin V10-codex-claude-integration`;
  - `wrangler deployments status` (both Workers);
  - `wrangler secret list --name hamzehi-social-ai-staging`.
- **Not re-queried:** staging D1 binding, crons and AI/R2 bindings. They are unchanged since 16.14-C, and the staging deployment record is unchanged.

## 3. Agent reliability assessment (code review of `agent-watchdog.js`, `agent-ops-store.js`, existing tests)
| Requirement | Status | Evidence |
|---|---|---|
| A. Independent watchdog | **Implemented (logically independent)** | `runWatchdog` runs in its own `ctx.waitUntil(isolate("watchdog"…))` on the `*/15` cron (`index.js` ~13317), before and independent of the scheduler. Phase 16.4: the orchestrator raises `watchdog_missed` (critical) when the Watchdog heartbeat is >35 min old. **Limit:** both run in the same Worker and cron. If the Worker or its cron stops entirely, nothing raises an alert (there is no external probe). |
| B. Heartbeat / health | Implemented | `agent_heartbeat` (autonomy + watchdog); `heartbeat_missed` critical after 35 min; `runs_unhealthy` after 3 unhealthy runs |
| C. Timeout detection | Implemented | `task_stuck` (>20 min running); per-task orchestrator timeouts (phototimeout suite) |
| D. Retry / recovery | Implemented, bounded | Read-only dead letters auto-re-queued (allow-list, at most once per task per day, at most 5 per run). Paid, draft and side-effect tasks: owner re-queue only. Alerts: open → recovered → acknowledged. |
| E. Dead Letter Queue | Implemented | `agent_dead_letters`: one open row per task, attempts counter, redacted error; `dead_letter_unresolved` escalation after 24 h |
| F. Versioning / rollback readiness | Implemented (reference only) | `agent_versions` active/previous; `version_unhealthy` when >50 % of ≥4 tasks fail. Code rollback stays an owner-approved Worker deploy (by design). |
| G. Quality evaluation / fallback | Implemented | `qualitySummary`; every alert carries a `fallback_status` text |
| H. Cost / resource control | Implemented for autonomy; **partially for Sales AI** | Atomic daily quotas (quotarace, adsquota, phase09), orchestrator budgets, 429/401/403 cooldown (16.4). **I3:** no global daily Sales-AI cost cap (owner decision, not implemented). |
| I. Customer context isolation | Implemented, locally verified | phase16_11, phase16_2, phase16_5 and phase12–14 isolation checks |
| J. Dashboard visibility | Implemented (pull only) | `/api/autonomy/agents/overview` and `/activity` (owner-auth); Agent Control Center cards; phase05, phase07 and phase14 tests |

**Failure record content:** each `agent_alerts` row holds:
- agent identity (`agent`) and severity (`level`: info, warning or critical);
- failure time (`first_seen_at` / `last_seen_at`) and cause (`cause_redacted`);
- impacted tasks (`affected_tasks_json`, ≤50) and fallback status (`fallback_status`);
- recovery status (`recovery_state` open/recovered plus `recovered_at` and `acknowledged_at`);
- history: `occurrences`, `last_run_id`, and `agent_runs.alert_codes_json` per run.

All the required fields are **present**.

**Implemented vs planned or missing:**
- **Push alerting is missing.** Alerts are persistent in D1 but are only *displayed* when the owner opens the dashboard (no polling, no Telegram or email push). A sustained critical alert can go unseen.
- **There is no external liveness probe.** Nothing outside the Worker notices a dead cron.
- **Production evidence:** all of the above is verified with **local mocks only**. Production alert behaviour (real cron, real D1) has **not** been observed in this phase. It is **not** claimed to work in Production.

## 4. Business and financial safety findings (existing evidence, `b29e9bf`)
Each rule below is covered by existing harness checks in the 708-check suite, re-run in full in this phase (§8).
| Rule | Covered by |
|---|---|
| IRAN = TOMAN, IRAQ = USD; no relabelling; no cross-currency totals | phase12, phase13 (per-currency money separation), phase14, phase16/16_2/16_3/16_5 |
| Market not inferred from language alone | phase14 (country = market evidence), phase16, 16_2, 16_3 |
| No invented prices | phase12, phase13, phase14 (answered only from approved prices), phase16* |
| No automatic approval of quotes, out-of-rule discounts, payments or commitments | phase12 (out-of-rule discount held, acceptance → candidate only, payment claim records nothing, confirm owner-only), phase16, phase16_5 |
| Existing-order vs new-inquiry routing | phase16, phase16_2, phase16_3 |
| Payment-ledger concurrency guards | phase16_11 (D-16.11-1), phase16_13 (D-16.13-1) |
| Duplicate-request idempotency | phase16_11, phase16_13 (A2/A3), phase16_4, phase16_5 |
| Follow-up drafts created, never sent | phase12, phase16_2, phase16_3 |
| Cancellation safeguards | phase13, phase16_11, phase16_13 |
| No unauthorised customer messages | phase12 (final send gate), phase16_5; every suite asserts no off-machine request |

**Finding:** no financial-safety defect was found. The Production Worker `5256ded0` **still contains both payment races** (fixed only in candidate `837a8e6d`). They are owner-only and need concurrency.

## 5. Remaining security issues
| # | Issue | Actual risk | Severity | Existing protection | Minimal solution | Needs |
|---|---|---|---|---|---|---|
| 1 | No Telegram sender allowlist for staging | When a test bot is connected, **any** Telegram user who finds it can DM it: private chats skip the chat-target check (`handleTelegramWebhook`, `index.js` ~6107) and would create leads and drafts in staging D1. | Medium (staging only; **blocks** the live staging window) | Webhook secret header; staging has no token, so it is inert today. Vault sender allow-list exists only for vault chats. | An env var such as `TELEGRAM_TEST_SENDER_ALLOWLIST`, enforced **only** when `HAMZEHI_ENVIRONMENT="staging"`, fail-closed (empty = reject all private messages), with a regression test. Production behaviour unchanged. | Code change (webhook auth path) **plus owner approval** (security-sensitive auth path, CLAUDE.md). Not implemented. |
| 2 | Staging `/api/health` said `production:true` | Operators or monitors could mistake staging for Production. | Low | Real identity is visible via Cloudflare | **Fixed locally** (§6) | Fix done; deploying it to staging or Production needs owner approval |
| 3 | `main` branch auto-deploys to Production | `.github/workflows/deploy-worker.yml` runs `wrangler deploy` on any push to `main` touching `worker/**`. A merge would deploy **at 100 %, with no canary, and without `AUTONOMY_ORCHESTRATOR`** (absent from `worker/wrangler.toml`), turning the orchestrator off in Production. | **High** (process) | Nothing is merged to `main`; the owner rule "never merge to main" | Change the trigger to `workflow_dispatch` only, or use `wrangler versions upload` (no deploy), and add `AUTONOMY_ORCHESTRATOR = "on"` to `worker/wrangler.toml`. | Owner approval (GitHub Actions + Production config). Not changed. |
| 4 | Workers Builds versions lack the orchestrator flag | Each V10 push creates an untagged version without `AUTONOMY_ORCHESTRATOR`. Deploying one silently disables the orchestrator. | High if deployed (0 % today) | "never deploy untagged" list; candidates are uploaded with explicit vars and tags | Add `AUTONOMY_ORCHESTRATOR = "on"` to `worker/wrangler.toml [vars]` (same root cause as #3), or disable Workers Builds for this branch. | Owner approval (Production config / Workers Builds) |
| 5 | Live Telegram and real AI unverified | Production inbound has been unverified since 10-08 (Phase 15 P1). Real provider 401/429/latency/cost are unknown. | High (release blocker) | Mocks, cooldowns, timeouts, per-message call budget (16.13 A2/A3) | Staging live window T1–T10 with a test bot; a bounded AI-02.5 window | Owner approval, a test bot and secrets; AI budget |
| 6 | Staging lacks Telegram tokens and `ADMIN_TOKEN` | No functional test is possible on staging. While the webhook secret is unset, the first webhook hit generates and stores a random secret in staging D1 (`telegramWebhookSecret`). Unauthenticated callers are still rejected (401). | Low (intentional) | All admin routes 401; every webhook refused (rehearsal N-checks) | Set the 3 staging-only secrets **together with** fix #1 | Owner approval |
| 7 | Owner policy decisions not to be defaulted | H1, H2, F3, I3, B3, C3, the mixed-intent text and the test-data classification are open. | Medium (business) | Code keeps the safe default for each (drafts only, `waiting_for_owner_price`, no cap invented) and does not silently pick a rule | Owner decides each one; then a scoped implementation phase | Owner decisions |

Also observed (hardening, not a defect):
- The webhook secret is compared with `!==` (`index.js` ~6105), although `secure-compare.js` exists.
- Remote timing exploitation of a 64-hex secret is not practical.
- Recommended as a one-line change inside the same owner-approved auth change as #1.

## 6. Minimal local fix
**D-16.15-1 — `/api/health` hard-coded `production:true`** (`worker/src/index.js`, the `/api/health` route, ~13481).
- **Defect:** the route always returned `production:true`, so staging (`HAMZEHI_ENVIRONMENT="staging"`) identified itself as Production.
- **Expected behaviour:**
  - `environment` = the `HAMZEHI_ENVIRONMENT` var, or `"production"` when it is unset;
  - `production` is true only for `"production"`;
  - Production output is unchanged except for one new field, `environment:"production"`;
  - the route stays public and exposes no secret.
- **Regression test first:** new `tests/harness/phase16_15.mjs` (6 checks). On the **unfixed** code: **3 of 6 failed** (H2, H4, H5; H4 showed `production:true` on the staging profile).
- **Fix:** 3 lines.
  ```js
  const environment = String(env.HAMZEHI_ENVIRONMENT || "production");
  // response: environment, production: environment === "production"
  ```
- **After the fix:** **6/6 pass**.
- **Note:** this fix is **local and uncommitted**. Candidate `837a8e6d` and staging `dfe1c2e0` do **not** contain it. It is cosmetic and **not** a rollout blocker. Shipping it needs a commit, a new upload and owner approval.

No other source change was made.

## 7. Exact tests executed
1. `node tests/harness/phase16_15.mjs` on unfixed code → 3 FAIL / 6 (expected: proves the defect).
2. `node tests/harness/phase16_15.mjs` after the fix → 6/6.
3. Full local regression, run once (Production source changed): the 22 baseline harness files, `phase16_15`, and `staging/staging-nosecrets-rehearsal.mjs` + `staging/staging-profile-rehearsal.mjs`.

- Mock Telegram and AI only.
- No paid call; no Telegram message; no real customer data.

## 8. Pass/fail counts
Full run 2026-10-29T15:57:09Z → 15:59:40Z (about 151 s), Node v24.21.0, all exit 0.

| Suite | Result |
|---|---|
| crmdisc / vaultsender / quotarace / phase02 / adsquota | 7 / 9 / 11 / 21 / 13 |
| phase04 / 05 / 06 / 07 / 08 / 09 | 44 / 30 / 27 / 26 / 21 / 55 |
| phototimeout / phase12 / 13 / 14 | 10 / 64 / 49 / 50 |
| phase16 / 16_2 / 16_3 / 16_4 / 16_5 | 82 / 37 / 32 / 28 / 45 |
| phase16_11 / phase16_13 | 33 / 14 |
| **Baseline (22 files)** | **708 / 708 PASS** |
| phase16_15 (new) | **6 / 6 PASS** |
| **Total harness** | **714 / 714 PASS, 0 FAIL** |
| staging/staging-nosecrets-rehearsal.mjs `<repo root>` | **14 / 14 PASS** |
| staging/staging-profile-rehearsal.mjs `<repo root>` | **15 / 15 PASS** |

Note: the first rehearsal attempt crashed (`ERR_INVALID_ARG_TYPE`) because it was started without its required `<repo root>` argument. It passed when re-run with the documented usage. This was not a code issue.

## 9. Files modified (this phase)
- `worker/src/index.js`: D-16.15-1 (3 lines in the `/api/health` route). **Tracked, modified, uncommitted.**
- `tests/harness/phase16_15.mjs`: new regression test. **Untracked.**
- `HANDOFF-2026-10-21/PHASE-16/PHASE-16-15-READINESS-SECURITY.md`: this report. **Untracked.**

## 10. Uncommitted files
- **Tracked and modified:** `worker/src/index.js`.
- **New and untracked:** `tests/harness/phase16_15.mjs` and this report.
- **Pre-existing and untracked (untouched):**
  - the 16.14 reports and `END-OF-DAY-2026-10-29.md`;
  - the HANDOFF phase folders 07–15 and `BACKUP-16-1`;
  - `migration-plan/` and `owner-actions/`.

**Scoped checkpoint recommendation (only on owner approval):**
- Commit exactly `worker/src/index.js`, `tests/harness/phase16_15.mjs`, the README harness row, and optionally the sanitised 16.14/16.15 reports. Never use `git add -A` (the repository is public).
- After a push, Workers Builds creates another untagged version **without the orchestrator flag. Do not deploy it.**

## 11. Release blockers (before any Production rollout of a candidate)
1. **Live Telegram is unverified:** both staging (T1–T10 not run) and Production inbound (Phase 15 P1).
2. **Real AI provider behaviour is unverified** (AI-02.5 not authorised).
3. **The staging sender allowlist (#1) must exist** before any test bot is connected.
4. **The `main`/Workers Builds orchestrator-flag risk (#3/#4)** is unresolved. Until then, the "never merge to main / never deploy untagged" rules are the only protection.
5. **Owner sign-off** on the rollout of `837a8e6d` (or a new candidate that includes D-16.15-1), in a monitored window with rollback `5256ded0@100%` ready.

Not blockers (risk accepted or deferred by the owner):
- push alerting;
- the external liveness probe;
- I3 cost cap;
- D1 read volume (P2).

## 12. Release readiness decision
| Area | Result |
|---|---|
| LOCAL TESTS | **Passed**: 714/714 harness (708 baseline + 6 new) + staging rehearsals 14/14 and 15/15 |
| STAGING ISOLATION | **Passed** (re-verified: `dfe1c2e0` @100 %, secrets `[]`; D1/crons/bindings per 16.14-C, unchanged) |
| AGENT RELIABILITY | **Partially verified**: implemented and locally tested; not observed in Production; no push alert or external probe |
| FINANCIAL SAFETY | **Verified locally** (both payment-race fixes in `b29e9bf` / `837a8e6d`; Production `5256ded0` still lacks them) |
| TELEGRAM LIVE | **Not tested** |
| REAL AI PROVIDERS | **Not tested** |
| PRODUCTION ROLLOUT | **Not authorised** |

## 13. Next recommended phase
**Phase 16.16, staging live-test preparation (local, then owner-gated):**
1. Implement the staging-only, fail-closed sender allowlist (#1) and the constant-time secret compare, with regression tests (needs the owner's go-ahead for the auth-path change).
2. Owner decision on the `main` workflow and `AUTONOMY_ORCHESTRATOR` in `worker/wrangler.toml` (#3/#4).
3. With approval: a scoped commit, a new candidate upload and a staging deploy containing D-16.15-1 and #1.
4. Then the live staging window: test bot, 3 staging secrets, T1–T10, `deleteWebhook`.

## 14. Owner decisions required
1. Approve the staging sender allowlist design (#1): an auth-path code change.
2. Approve changing `.github/workflows/deploy-worker.yml` and adding `AUTONOMY_ORCHESTRATOR="on"` to `worker/wrangler.toml` (#3/#4), or keep the manual rule.
3. Approve a scoped commit/push of D-16.15-1 + test (+ reports).
4. Business policy: H1, H2, F3, I3 (Sales-AI daily cost cap and its threshold), B3, C3, the mixed-intent clarification text, and the historical test-data classification.
5. Later, separately: the test bot and staging secrets, the AI-02.5 budget, the Production rollout window.
6. Optional: whether push alerting for sustained critical agent alerts (owner Telegram) should be planned.

**STOP. Phase 16.16 was not started.**
