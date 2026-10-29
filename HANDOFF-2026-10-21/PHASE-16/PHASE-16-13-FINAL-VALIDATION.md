# PHASE 16.13 — Final integration, agent reliability and business-safety validation

Date: 2026-10-29. Mode: targeted audit → mock tests → minimal fix → report.
- Local mock testing only.
- **No** commit, push, upload, deploy, D1 write, Telegram, AI call, cron or Cloudflare change.

## 0. Checkpoints (verified, read-only)
| Item | State |
|---|---|
| Git | branch `V10-codex-claude-integration`; HEAD = remote = `74d854e3ba12…`; no tracked changes at the start; unrelated untracked files preserved |
| Staging | `hamzehi-social-ai-staging` **`fb802744`** @100 %; secrets `[]`; no R2 and no AI binding (only `DB` = `cddc10c5…`); schedules `[]` |
| Production | **`5256ded0` @100 %**; schedules `0 7 * * *`, `*/15 * * * *` (unchanged) |
| Release candidate | `e221f7dd` (74d854e, orchestrator on): **0 %**, in no deployment |

## 1. Tests actually executed
**Reused, not duplicated.** The 694-check suite already covers these requested areas:

| Area | Covering suites |
|---|---|
| Customer identity isolation and no cross-customer exposure | 16.5 B3/B4/E6, phase12–14, 16.2, vaultsender |
| Iran/Iraq classification | phase12 M3–M7, phase14, 16, 16.2, 16.3 |
| Order and confirmation approval gates | phase12, 16 (11 cancel checks), 16.5 B6/B7 |
| Payment concurrency and idempotency | 16.11 P1–P13 |
| Duplicate Telegram updates | phase04, 16.5 B1/B2/E2b |
| Follow-up drafts never sent | phase09, phase12, 16.2, 16.3 |
| Watchdog, recovery and DLQ | phase02, 05–08, 16.4 A2–A6 |
| Provider errors and fallback | 16.4 D1–D8, 16.5 A1–A7, 16.11 C1–C4 |
| Concurrency | 16.5 B, quotarace, adsquota |
| Unauthorised admin access | 16.11 S/T (all 164 routes), 16.5 E4/E5 |

**New targeted probes (exploratory, then made permanent) in `tests/harness/phase16_13.mjs` (14 checks):**
- **R1–R8 order-lifecycle invariants under concurrency.** The status must always agree with the ledger:
  - payment reversal ↔ shipment, both orderings (the fix);
  - reversal after shipment;
  - reversal ↔ new payment;
  - cancel ↔ payment, both orderings;
  - triple concurrent confirm;
  - double ship;
  - one order per quote;
  - no customer send from any owner financial transition.
- **A1–A4 per-message AI call budget:**
  - one message → exactly **1** provider call;
  - the same update ×3 concurrently → 1 inbox row and **1** call;
  - a redelivery under a new `update_id` → **0** calls;
  - no off-machine requests.

**Results:**
| Run | Result |
|---|---|
| `phase16_13` (with the fix) | **14/14 PASS** (0.9 s) |
| `phase16_13` against the **unfixed `74d854e` code** | **1 FAIL: R1 "reversal first"** → `[[200],[200]]`, order `shipped`, ledger **0**. The defect is reproduced and caught. |
| **Full local regression** (22 files, run once because source changed) | **708/708 PASS**, 0 failures, about 141 s |

## 2. Defects and minimal fixes
**D-16.13-1 (financial integrity): a payment reversal racing a shipment could leave a shipped order unpaid.**
- **Old behaviour:** `reverseOrderPayment` checked `status IN (partially_paid, paid)` and then inserted the reversal row with an **unconditional** `INSERT … VALUES`.
- **Race:** if the owner's "ship" committed in between, both requests returned 200. The order stayed `shipped` while its ledger was fully reversed (net 0). This broke the rule "only an unshipped recorded payment can be reversed". Only the conflict check on the INSERT existed, and it always succeeded.
- **Who can trigger it:** owner-only (both actions need `ADMIN_TOKEN`). Nothing was sent to the customer.
- **Fix:** one statement plus a 2-line comment. The reversal is now `INSERT … SELECT … FROM lead_orders WHERE id=? AND status IN ('partially_paid','paid')`.
  - If the order changed in between, the insert affects 0 rows and the **existing** "Payment reversal conflict; reload the order" (409) path is used.
  - Unchanged: same columns and values, the idempotency key `reversal:<id>`, the unique index protection, the error texts, and the schema (no migration).
- **Verified:**
  - "ship first" → ship 200, reversal 409 "Only an unshipped recorded payment can be reversed".
  - "reversal first" → reversal 409 conflict, ship 200.
  - In both cases the order is `shipped` with a full ledger.

**Checked, no defect:**
- **cancel ↔ payment** is already guarded inside the UPDATE (16.1).
- **confirm** is compare-and-swap; **ship** and **fulfill** are guarded on status.
- **Duplicate orders:** unique `quote_id`, `order_number` and acceptance-message indexes.
- **reversal ↔ new payment** stays consistent through the 16.11 ledger guard.

## 3. Totals
| Item | Value |
|---|---|
| New checks | 14 |
| Full suite | **708 / 708 PASS** (previously 694) |
| Failures | 0 |
| Fixes | 1 (D-16.13-1) |

## 4. Agent reliability findings (from executed tests; no invented measurements)
- **AI usage:** at most **one provider call per customer message**. Duplicate deliveries (concurrent ×3) and redeliveries cost no extra call (A1–A3). No repeated AI calls were found in the orchestration path.
- **Local timings (mock AI, not production latency):**
  - about 20–85 ms per message in the harness (16.5 D1 and this phase's probe);
  - the 6 provider failure modes complete within the bounded timeout (16.5 A4, < 9 s for a hanging provider);
  - real network or provider latency is **not** measured.
- **Failures stay visible, not silent:**
  - a failing scheduled step is recorded once per hour (`scheduled_step_failed`, sanitised) and the other independent steps still run (phase14 S1/S2);
  - the autopilot chain still stops at the first failure **by design**, so the paid weekly-video steps never run after a failure; this is recorded (phase14 F4);
  - the watchdog runs before and independently of the autonomy gate;
  - a stale watchdog is detected independently by the orchestrator as a critical `watchdog_missed` with deduplication and recovery (16.4 A4–A6);
  - the master-gate read fails closed and is recorded (`master_gate` step).
- **Dashboard visibility:**
  - agent cards show the last error, open alerts, repeats, recovery, fallback and owner acknowledgement (phase14 D3);
  - the Owner Action Center and the Telegram readiness card are present (phase14 D1/D2);
  - the overview carries the DLQ per agent (phase07 D4/D5).
- **Limitation:** there is no per-agent heartbeat beyond what phase14 D4 states (shown as a limitation on the dashboard).

## 5. Business and financial safety findings
- **Money ledger invariants now hold under every concurrent owner transition tested:** paid ⇔ net = total; shipped/fulfilled ⇒ net = total; cancelled ⇒ net = 0; no overpayment.
  - This covers both race fixes (16.11 payment, 16.13 reversal).
- **No automatic customer messages** from payment recording, reversal, confirmation or shipment (16.11 P13, 16.13 R8). Follow-ups remain drafts (phase09, 12, 16.2, 16.3).
- **Unapproved prices or amounts** never reach a customer on AI failure (16.5 A3, 16.11 C4).
- **Auth:** no route works without the admin token except the public allowlist (16.11 S).

## 6. Release readiness
| Level | Status |
|---|---|
| **Verified locally** (mock Telegram, mock AI, `node:sqlite`) | everything above; 708/708 |
| **Verified on staging** (`fb802744` = 74d854e) | deploy, bindings (D1 only), no secrets, no cron, health 200, admin routes 401, zero outbound traffic (16.10 analytics: 0 subrequests). **No functional message flow**: there is no bot or admin token by design. |
| **Not tested with live Telegram** | inbound webhook delivery, real replies, the owner hold UX (Phase 15 P1 is still open, including for current Production) |
| **Not tested with real AI providers** | Anthropic responses, real 429/401/403 behaviour, latency, cost (AI-02.5 not authorised) |

**Assessment:**
- The code at **74d854e + the 16.13 fix** is **locally release-ready**.
- **Blocker 1:** the uploaded candidate **`e221f7dd` does NOT contain D-16.13-1**. Deploying `e221f7dd` would ship the reversal race.
- **Blocker 2:** the 16.13 fix must be committed, uploaded as a new candidate and deployed to staging before any rollout decision.
- **Blocker 3:** live Telegram verification remains unproven.

**No Production deployment is authorised or recommended until these are resolved.**

## 7. Files modified (local, uncommitted)
| File | Change |
|---|---|
| `worker/src/index.js` | +3/−1: conditional reversal insert (D-16.13-1) |
| `tests/harness/phase16_13.mjs` | new, 14 checks |
| `tests/harness/README.md` | run list, phase16_13 row, total 708/708 |
| `HANDOFF-2026-10-21/PHASE-16/PHASE-16-13-FINAL-VALIDATION.md` | this report |

Still local and uncommitted from earlier phases: `PHASE-16-12-A-GIT-CHECKPOINT.md`, `PHASE-16-12-B-UPLOAD-REPORT.md`, `PHASE-16-12-C-STAGING-UPDATE.md`.

## 8. Recommended next phase: 16.14 "candidate refresh", each step with owner approval
1. **Scoped commit and push** (V10 branch only): `worker/src/index.js`, `tests/harness/phase16_13.mjs`, `tests/harness/README.md`, and the 16.12-A/B/C and 16.13 reports.
   - The automatic build will create one more untagged version without the orchestrator flag. Never deploy it.
2. **Upload-only official candidate** from the new commit, with `--var AUTONOMY_ORCHESTRATOR:on --keep-vars --tag <commit>-orch-on`. It supersedes `e221f7dd`.
3. **Staging update** to the same commit (no secrets, no cron).
4. **Separate owner decision:** a Telegram test-bot window on staging (16.9 T1–T10), then the Production rollout plan (16.6 §8).

STOP: Phase 16.13 is complete.
