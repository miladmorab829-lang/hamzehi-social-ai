# PHASE 16.5 — Integration hardening, stress testing and release readiness

Date: 2026-10-28 · Branch `V10-codex-claude-integration` · base `5ad943b` (Phase 16.4).
No Cloudflare upload or deploy. No D1, secret, binding, route or cron change. No real Telegram message, no external AI call. Production was not queried.

## 1. Defects discovered
**No new code defect was reproduced in this phase.** Every integration, concurrency and security scenario passed against the unchanged 16.4 code.

Two first-run failures were wrong test expectations, not code defects. Both were corrected in the test with the evidence below; no test was removed or weakened.
- **E2, oversized message:** a 50,000-character message from a real (non-bot) sender is a normal message, so a reply to it is correct.
- **E2, unseen edit:** an `edited_message` for a message that was never received is treated as a new message. The realistic case was added as E2b: editing an already processed message is deduplicated by `chat_id:message_id`, with no second inbox row and no second reply.
- **A7, cooldown observed early:** the cooldown was already active from the setup messages. This confirms the behaviour; the test now resets the cooldown after setup.

## 2. Fixes implemented
None in source code. No defect was supported by a failing test, so nothing was changed in `worker/src`, per the brief.

## 3. Modified files
- `tests/harness/phase16_5.mjs`: new, 45 tests.
- `HANDOFF-2026-10-21/PHASE-16/PHASE-16-5-REPORT.md`: this report.

## 4. Test results
- phase16_5: **45/45**.
- Full harness, run once: **661/661 PASS** across 20 suites (616 + 45). No failure, no skipped suite.
- `node --check` on every `worker/src/*.js`: clean.

## 5. Concurrency and stress findings
All runs are bounded batches in the mock world.

| Scenario | Result |
|---|---|
| Same update delivered 3× at once | 1 inbox row, ≤1 reply, all 200 (B1) |
| Same message under a new `update_id` | processed once (B2) |
| Edit of a processed message | not processed again (E2b) |
| 6 customers at once | 6 separate leads; each reply goes only to its own chat (B3) |
| 1 new customer, 3 messages at once | 1 lead, 1 conversation, no duplicate contact (B4, B5) |
| 3 concurrent owner approvals of one draft | one approved state, at most one audit event, nothing sent by approval (B6, B7) |
| Scheduled tick with failing background work + inbound message | customer still handled (A6) |
| Covered earlier, reused | concurrent follow-up runs (16.3 A1/A6), duplicate job retry and stale `running` (16.4 B1–B5), overlapping watchdog runs (16.4 A2) |

## 6. Performance (local mock world only — not production figures)
- Inbound + Sales Brain: **≈20–24 ms per message** over n=10, with the mock AI and including the harness's own ageing step.
- Heap delta for that batch: **< 2 MB**.
- Provider calls: on a 429, only the first message calls the provider; the following ones skip it (A7).
- The Watchdog timing in this suite is not meaningful: the test drops its store to simulate failure.
- No before/after baseline exists for these numbers, so no comparison is claimed.

## 7. Security and approval gates
- AI failure modes (HTTP 500, unreadable JSON, truncation, refusal, network error, timeout):
  - deterministic fallback;
  - state stays valid JSON;
  - no unapproved amount is sent;
  - answered within the bounded timeout (A1–A4).
- AI failure + an open order: the post-sale owner hold still applies (A5).
- Webhook:
  - malformed, partial, oversized, bot and edited payloads give no 5xx (E1, E2);
  - a wrong webhook secret is refused and nothing is stored (E3).
- **13 owner/admin endpoints** refuse unauthenticated calls, and a wrong token is refused (E4, E5). The endpoints cover order transition/payment/balance, follow-up runs, lead patch, outreach approval, agents overview, orders, quotes, decisions and knowledge review.
- A customer quoting another customer's order number gets none of its data (E6).
- No order or payment was created or changed by any chat (E7).
- No bot token, webhook secret, AI key or admin token appears in `system_events` / `autonomy_events` (E8).
- Market/currency, discount, deposit and cancellation guards remain covered by phase16 to 16_3.

## 8. Release readiness: NOT production-ready yet
Local status: green. That alone is not a release decision.

**Blockers before Production:**
1. **Live Telegram verification is still open (Phase 15 P1).** A fresh test account must check Persian and Iraqi-Arabic sales, an existing-order customer, a mixed-market message and the acknowledgement on hold. This needs an owner-approved upload and test window.
2. **The candidate has never been uploaded.** `5ad943b` contains 16.1 to 16.4. The last upload, `68aff866` (as reported by the owner), predates 16.2 to 16.4.
3. **Owner decisions pending:**
   - I3 Sales-AI spending cap
   - H1 scheduled revenue follow-ups
   - H2 second nudge
   - F3 IRAN balance draft
   - B3 country-only market evidence
   - C3 IRAN formal quote from approved price
   - wording of a customer clarification question for mixed messages
   - Phase 16.0 test-data flags (D1 write)

**Configuration: local vs `worker/wrangler.toml`.**

| Item | Local harness | `wrangler.toml` | Note |
|---|---|---|---|
| Sales AI provider | anthropic, mock | anthropic, `claude-opus-5-5` | provider policy unchanged |
| `SALES_AI_TIMEOUT_MS` | 5000 | 15000 | the code clamps it to ≤15 s |
| `RATE_LIMIT_PER_MINUTE` | 100000 | 60 | |
| `SALES_AI_PROVIDER_COOLDOWN` | default on | unset → **on** | new in 16.4; set `off` to restore the old behaviour |
| `SALES_AI_MAX_OUTPUT_TOKENS` | unset | unset → **inactive** | new in 16.4 |
| `AUTONOMY_ORCHESTRATOR` | per test | passed at upload (`--var AUTONOMY_ORCHESTRATOR:on`, per earlier release notes) | needed for `watchdog_missed` |
| Bindings | mocks | `DB`, `AI`, `GALLERY_BUCKET`; crons `0 7 * * *` and `*/15 * * * *` | **no new binding or cron required** |

- **D1:** no new migration in 16.1 to 16.5. The code relies on the agent-ops (stage 2b) and MEM-02 tables already applied in Production according to earlier phases. That was not re-verified now; a read-only check is recommended before deploy.
- **Rollback prerequisites:** current Production #470 `5256ded0` (reported). The older rollback reference #468 `7d31d5fb` is in project notes. Do not deploy #465, #467 or #469. Rollback is a traffic switch with no schema dependency, because 16.x adds no migration.

**Safe post-deployment verification plan** (after the owner approves upload and deploy):
1. Read-only deployment/version check.
2. `/api/autonomy/agents/overview`: watchdog heartbeat fresh, no new critical alert, `rollback` list present.
3. Fresh test account on Telegram:
   - Persian price question → approved TOMAN answer or owner hold;
   - Iraqi Arabic with «لكربلاء» → ARAB/USD;
   - «ببغداد وبطهران» → undecided;
   - existing-order status vs new product;
   - mixed message → held + one acknowledgement.
4. Confirm that no follow-up was sent automatically.
5. Watch `sales_brain` events for `provider_cooldown` / errors for 24 h.
6. On a regression, owner rollback to #470.

## 9. GitHub
Commit and push: see the final report (hash recorded after the push).

## 10. Production / Cloudflare actions
- **Performed:** none.
- **Not performed:** upload, deploy, D1 read/write, migration, secret/binding/route/R2/cron change, agent activation, real Telegram message.
- **Not verified in this phase:** the live Production version and the last upload id. Both are as reported.

## 11. Recommended next phase
The owner approves `wrangler versions upload` of `5ad943b`/16.5 (no deploy), then the live Telegram verification above, then the owner's deploy decision. Phase 16.6 is not started.
