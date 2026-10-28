# PHASE 16.8 — Isolated release validation and controlled test readiness

Date: 2026-10-28 (after the laptop restart). Wrangler 4.154.0, OAuth, account `d6820791…071c`. Node v24.21.0.
**Local only. Not committed or pushed.** Read with: [PHASE-16-6-READINESS-REPORT.md](PHASE-16-6-READINESS-REPORT.md), [PHASE-16-7-UPLOAD-REPORT.md](PHASE-16-7-UPLOAD-REPORT.md).

## 1. State after the restart (all re-verified, nothing taken from memory)
| Item | Result |
|---|---|
| Git branch | `V10-codex-claude-integration` |
| Local HEAD / GitHub HEAD | both `f02546c0fd9aed935999be368266e47eb333f1fb` (after a fetch) |
| Tracked changes | none; `worker/` and `tests/` identical to `f02546c` (`git diff f02546c -- worker tests` empty, no untracked file in them) |
| Untracked files | 59 pre-existing, unrelated handoff/migration-plan/owner-action items, left untouched |
| Production (`wrangler deployments status`) | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @ **100 %**, deployed 2026-10-23T08:13:35Z, tag `7e8985c-orch-on`. **Unchanged.** |
| Release candidate (`wrangler versions view`) | `3cb84e58-dbb5-4d11-895e-99ba726b2330` exists: tag `phase16-7-f02546c-orch-on`, created 2026-10-28T00:03:59Z, **0 % traffic** |
| Newer versions | none after `3cb84e58` (`wrangler versions list`). No unexpected Production change was found. |

**Candidate configuration (re-read):**
- compatibility `2026-09-11` + `global_fetch_strictly_public`; handlers `scheduled`, `fetch`;
- bindings `DB` (D1 `40b272c5…`), `GALLERY_BUCKET` (R2 `hamzehi-gallery`), `AI`;
- `AUTONOMY_ORCHESTRATOR="on"` plus the same 9 `wrangler.toml` vars;
- the same 7 secret names as Production (values not read).
- This matches 16.7's line-by-line comparison with Production.

## 2. Can `3cb84e58` be tested in isolation? **No, not with the existing infrastructure.**
Checked with read-only Cloudflare API GETs (the token was held in a shell variable and never printed):
- `GET …/workers/scripts/hamzehi-social-ai/subdomain` → `{"enabled": true, "previews_enabled": false}`
- `GET …/workers/subdomain` → `miladmorab829`

What this means:
1. **No version preview URL exists.** Preview URLs are disabled for this Worker, so `3cb84e58` cannot be reached at all without a deployment or a settings change.
   - Side effect (good): the untagged Git builds that lack the orchestrator flag (`925196e1…99c203a3`) are not reachable over HTTP either. This partly settles concern J3.
2. **`workers.dev` is enabled.** It serves only the active deployment (`5256ded0`), so it cannot test the candidate.
3. **Enabling preview URLs would still not be isolated.** It is a configuration change that needs owner approval, and a preview of `3cb84e58` would use the **production** `DB`, R2 and secrets. The `fetch` handler writes to D1 (inbox, rate limits, events). It would also expose every untagged build.
4. **Telegram can only reach the deployed version.** The webhook points to Production. Pointing it anywhere else would itself be a Production change (`setWebhook`).
5. **Not done:** no new Worker, preview, route, binding or `wrangler dev --remote` was created. As instructed, the options that need approval are listed in §6.

**Conclusion:** isolation from Production data cannot be proven for any live test path. Validation therefore used **local mocks only**.

## 3. Checks actually performed
| # | Check | Result |
|---|---|---|
| 1 | Version metadata and binding compatibility of `3cb84e58` vs Production `5256ded0` | identical bindings, vars (plus orch on) and secret names; same compat date and flags |
| 2 | Static build (`wrangler versions upload --dry-run --outdir <scratchpad>`, **nothing uploaded**) from the clean `f02546c` tree | compiles; **2164.33 KiB / gzip 504.85 KiB**, the same size as the 16.7 upload; bindings as expected; `AUTONOMY_ORCHESTRATOR` supplied |
| 3 | Mock-isolation audit of `tests/harness/harness.mjs` | Every `fetch` is intercepted: Anthropic is a mock that refuses any non-test key; Telegram is a mock; everything else returns 503 "network disabled in tests". D1 is in-process `node:sqlite`. The opt-in `realAi` path is not used by any test file, and no `.dev.vars` exists. |
| 4 | **Targeted rerun:** `node tests/harness/phase16_5.mjs` (the integration, stress and security harness, mock world). The run checks that the toolchain still works after the restart; there was no source change. | **ALL PASS (45/45)**, 13.1 s |
| 5 | Production state re-verification (deployments status / versions list) | unchanged, see §1 |

The full 661-test suite was **not** rerun. There has been no source change since the 661/661 run at `f02546c`, so that result is still valid.

## 4. Critical release scenarios: evidence
Sources: the 661/661 run at `f02546c` and today's 45/45 rerun of `phase16_5`. Counts are `ok(...)` assertions whose name matches the topic.

| Scenario | Evidence (harness files) | Status |
|---|---|---|
| Telegram duplicate-update protection | phase04 (4), phase12, phase13, phase16, phase16_5 (4, incl. duplicate webhook delivery under concurrency; rerun today) | covered, mock |
| Customer context isolation | phase02, phase08, phase12–14, phase16_2, phase16_5 (cross-customer, rerun today), vaultsender | covered, mock |
| Existing order vs new purchase intent | phase16 (3), phase16_2 (3), phase16_3 (2) | covered, mock |
| Iran/TOMAN vs Iraq/USD | phase12 (16), phase13, phase14, phase16, phase16_2, phase16_3 (Arabic-prefixed Iran city) | covered, mock |
| Owner approval for financial actions | phase09 (6), phase12 (9), phase13 (5), quotarace (2), phase16_5 (2, repeated approvals; rerun today) | covered, mock |
| AI provider cooldown and deterministic fallback | phase16_4 (4), phase16_5 (429 across customers plus 6 AI failure modes; rerun today) | covered, mock |
| Watchdog and recovery | phase02, phase06–08, phase14, phase16_4 (`watchdog_missed`, incident state) | covered, mock |
| Follow-up draft idempotency | phase09 (11), phase12, phase16_2 (4), phase16_3 (7, reschedule re-draft) | covered, mock |
| No automatic payment messages | phase13 (6), phase14 (5), phase16 (5), phase16_5 A5 (card request + AI failure → owner hold; rerun today) | covered, mock |
| No unauthorised order changes | phase16 (11, cancel blocked after payment/shipment), phase16_3, phase14 | covered, mock |

## 5. Still unverified
1. **Live Telegram inbound and the live Sales-AI path.** P1 since 10-08 (Phase 15). This applies to the **current** Production too, not only to the candidate.
2. **Behaviour against the real Anthropic API** (paid; not authorised). Only mock failure modes are proven.
3. **Webhook target and secret** (`getWebhookInfo` needs the bot token, so it was not called).
4. **Byte equality of the uploaded `3cb84e58` bundle with `f02546c`.**
   - What supports it: the clean tree at upload time (16.7), today's identical bundle size, and the matching tag.
   - Why it is not proven: no download or hash comparison of the version's content was made.
5. **D1 schema drift since 16.6.** Not re-queried. Production is unchanged and no migration was run, so the 16.6 result (82 tables and 82 indexes, all required columns present, no migration needed) is reused.
6. **Workers Builds (auto-upload on push) settings.** Still not readable through the read-only Wrangler commands. Any new push will create another **untagged** version without the orchestrator flag.

## 6. Options for a live test (each needs owner approval; **none was performed**)
| Option | Isolation | Cost / risk |
|---|---|---|
| **A. Controlled full switch in a monitored window**: `versions deploy 3cb84e58…@100%`, run the owner test-account script (16.6 §8.4), and roll back immediately if needed: `versions deploy 5256ded0…@100%` | none (it is Production) | rollback is instant and has no schema dependency; real customers may write during the window |
| B. Separate staging Worker: its own name, an empty schema-only D1 copy, its own **test** Telegram bot and token, no crons, no R2 or a separate bucket | full | a new Worker, D1, bot and secrets: infrastructure plus setup time; paid AI only if a key is given |
| C. Enable preview URLs for `hamzehi-social-ai` | **not isolated** (production D1, R2 and secrets); Telegram cannot target it | **not recommended**; it also exposes the untagged builds (J3) |

## 7. Release gate: **CONDITIONAL GO** for a controlled rollout (Option A), **not** an authorisation to deploy
| Criterion | Assessment |
|---|---|
| Source commit to upload | `f02546c` (local = GitHub, clean) → `3cb84e58` (tag `phase16-7-f02546c-orch-on`) ✅ |
| Configuration compatibility | identical bindings, vars and secret names to Production; orchestrator on ✅. Cooldown on by default and no token cap, as accepted in 16.6 |
| D1 schema | compatible, no migration (16.6) ✅ |
| Customer data isolation | covered by mock tests ✅; live path unverified ⚠ |
| Business decisions still open | H1, H2, F3, I3, B3, C3, the mixed-intent text and the historical test-data classification. **Not blocking**: the code keeps safe defaults (hold for owner). |
| Live Telegram prerequisites | an owner test account, a monitored window, the test script (16.6 §8.4) and `wrangler tail`. **Not yet met: owner action.** |
| Monitoring and rollback | `/api/autonomy/agents/overview`, `sales-brain` events, `scheduled_step_failed`, `wrangler tail`. Rollback = `5256ded0@100%` (fallback `7d31d5fb`) ✅ |
| Hard prohibitions | never deploy untagged versions (`925196e1`, `d9a51603`, `51b22354`, `39b7e425`, `99c203a3`) or #465/#467/#469 |

**NO-GO conditions, before or during the rollout:**
- Production differs from `5256ded0@100%` at deploy time.
- The watchdog or orchestrator heartbeat is not fresh after the deploy.
- Any automatic payment or price message without approval.
- A cross-customer leak in the test.
- A sustained `provider_*` error rate.

## 8. Exact next step (needs the owner)
**Recommended:** the owner approves a **monitored Option-A window**.
1. **Re-check (read-only):** `wrangler deployments status` must show `5256ded0@100%`.
2. **Optional baseline:** one owner test message to the **current** bot, to separate a pre-existing inbound fault (P1, D-01) from release effects.
3. **Deploy:** `npx wrangler versions deploy 3cb84e58-dbb5-4d11-895e-99ba726b2330@100% --message "Phase 16 f02546c (orchestrator on)"`.
4. **Test:** the owner sends the 16.6 §8.4 script from a test account. Watch `wrangler tail` and the agents overview for about 30 min.
5. **Roll back on any NO-GO condition:** `npx wrangler versions deploy 5256ded0-4aab-4b5a-95c1-ccd7a1752a9a@100% --message "Rollback to Phase 14 (orch on)"`.

Alternative: if the owner wants a live test before touching Production, approve Option B (staging Worker plus test bot) first.

## 9. Not performed (confirmed)
- No version upload. The dry run wrote only to the scratchpad.
- No deploy, traffic change or rollback.
- No new Worker or preview. No preview-URL setting change.
- No D1 query or write; no migration.
- No secret, binding, route, domain, cron or R2 change. Secret values were not read.
- No Telegram message, no paid AI call, no owner approval executed.
- No Git commit or push.
- The protected original was not accessed.
- Phase 16.9 was not started.
