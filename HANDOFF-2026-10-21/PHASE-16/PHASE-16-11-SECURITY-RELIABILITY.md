# PHASE 16.11 — Staging security, reliability and integration validation

Date: 2026-10-28. Mode: inspect → test → fix → report.
- Local mock testing only.
- **No** Telegram, webhook, real AI, deploy (Production or staging), D1 write, cron or Cloudflare change.
- **Not committed or pushed.**

## 1. Environment (verified, read-only)
| Item | Result |
|---|---|
| Git | branch `V10-codex-claude-integration`; HEAD = GitHub = `f02546c`; no tracked changes before this phase; untracked files preserved |
| Production | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @**100 %** (deployment 2026-10-23T08:13:35Z); schedules `0 7 * * *`, `*/15 * * * *` unchanged; newest version `3cb84e58` (0 %). Re-checked at the start and the end. |
| Staging | `hamzehi-social-ai-staging` `bed3bccd` @100 %; schedules **`[]`**; secrets **`[]`**; only binding `DB` = `cddc10c5-2232-4334-8d99-fedb52fbd12d` (≠ Production `40b272c5-…`); `GET /api/health` → 200 (this route returns before any D1 access) |

## 2. Tests executed
**Reused (no duplication).** Existing suites already covered:
- duplicate and concurrent Telegram delivery (16.5 B1–B5);
- malformed payloads and the wrong webhook secret (16.5 E1–E3);
- admin 401 (16.5 E4/E5 and others);
- cross-customer isolation (16.5 E6, B3);
- market and currency integrity (phase12 M3–M7, X17–X23);
- the approval gate (phase12, 16.5 B6/B7);
- cooldown for 429 and 401, timeout and fallback (16.4 D1–D8, 16.5 A1–A7);
- watchdog detection and recovery (16.4 A2–A6, phase05–08);
- DLQ (phase02, phase06/07 D4/D5);
- follow-up idempotency (phase09, phase12, 16.2, 16.3).

**New: `tests/harness/phase16_11.mjs` (33 checks), only for what was missing.**

**S. Complete auth sweep.** Every route found by scanning `worker/src` (164 routes × GET/POST × no token / wrong token = 656 calls):
- no 2xx except the public allowlist (`/dashboard` shell, `/dashboard.js`, `/api/health`, `/api/site/content`);
- no 5xx except the deliberate Instagram fail-closed 503;
- no data row written;
- no Telegram or AI call.

Because the sweep discovers routes automatically, a future route without auth fails this test.

**T. Admin-token edge cases:**
- prefix, suffix, missing scheme, Basic, empty, doubled token and another header are all refused;
- with `ADMIN_TOKEN` **unset** (staging), `Bearer undefined` / `null` / empty open nothing.

**P. Payment-ledger integrity under concurrency:**
- races between partial, full and deposit payments;
- the same reference posted twice, concurrently or not, is idempotent;
- the same reference with a different amount is refused;
- currency mismatch, overpayment and closed orders (cancelled, draft, shipped) are refused;
- no token → 401;
- concurrent reversal → exactly one;
- an ARAB order becoming fully paid sends nothing automatically.

**C. Cooldown:**
- **403** cools down (120 s, same as 401), with no retry and no other provider;
- **500** does **not** cool down; each message is tried once and then falls back deterministically;
- no unapproved amount reaches a customer.

**G. Staging profile** (staging vars, **no secrets**, no R2 or AI, master off):
- every webhook delivery is refused;
- both cron schedules are inert;
- **zero outbound calls**;
- no customer, order or payment rows.

**Results:**
| Run | Result |
|---|---|
| `phase16_11` (after the fix) | **33/33 PASS** |
| `phase16_11` against the **original `f02546c` code** (proof that the test catches the defect) | P1, P1b and P7 **FAIL**: the defect is reproduced. P2, P8, P9 and P12 fail only as follow-on effects of the corrupted ledger. |
| **Full local regression suite**, run once because source changed (21 files) | **694/694 PASS** (the previous 661 + 33), about 135 s |

## 3. Verified defect and fix
**D-16.11-1 (financial integrity, P1): concurrent payments could overpay an order.**

`recordOrderPayment` (`worker/src/index.js`) validated the balance against the ledger it had read (`paidBefore`). The guarded `INSERT … SELECT … WHERE` then only checked `status IN ('confirmed','partially_paid')`.

**Reproduced:** two concurrent owner requests, `partial` 600 + `partial` 600 with references A and B, on a 1,000 TOMAN order. **Both returned 200**, so 1,200 was recorded and the order was marked `paid`. Two concurrent `deposit` requests also both succeeded.

**Context:**
- **Who can trigger it:** the authenticated owner only, for example through a double submission or two dashboard tabs with different references. Customers cannot.
- **Messages:** nothing was sent automatically.
- **Scope:** the same code exists in Production and in `3cb84e58`.

**Fix (minimal, 1 statement plus a 2-line comment).** The `INSERT` now also requires `(SELECT COALESCE(SUM(amount_minor),0) FROM lead_order_payments WHERE order_id=?) = paidBefore`. This is the same expression `orderPaidMinor` uses: optimistic concurrency on the ledger that was validated.
- **When the ledger has changed:** the insert affects 0 rows, the two dependent updates (`EXISTS(... id)`) do nothing, and the existing path returns **409 "Payment recording conflict; reload the order"**.
- **Unchanged:** behaviour without concurrency, the same-reference idempotency, every error message, and the schema (no migration).

**Verified:**
- the second concurrent payment gets 409;
- the ledger stays 600 / `partially_paid`;
- recording the real remaining 400 afterwards makes the order `paid` at exactly 1,000.

**Not a defect (documented):**
- **Rejected webhooks:** logged at most once per reason per minute (deterministic ID with `INSERT OR IGNORE`), plus a rate-limit counter.
- **`/api/photo-autopilot/toggle` without a token:** runs only idempotent `CREATE TABLE IF NOT EXISTS` (autonomy store) before returning 401. No data is written.
- **`/api/website/track`:** public by design (site analytics). Capped at 3 KB (413 above that) and rate-limited.
- **Instagram webhook while unconfigured:** returns 503 "secrets not configured" before reading the body (fail-closed).
- **Second concurrent reversal:** blocked by the unique index `(order_id, method, reference_key)`. It returns 409 with the raw SQLite text ("UNIQUE constraint failed"). Cosmetic and owner-only.

## 4. Remaining security risks
1. **The fix is not deployed.** Production and candidate `3cb84e58` still contain the race. A new version upload of the fixed commit is needed (owner approval), and `3cb84e58` should be **superseded** and not deployed.
2. **Public write surface:** `/api/website/track` stores public analytics events. It is bounded by size and rate limit, not by auth. This is by design; the owner should confirm it is still wanted.
3. **No sender allowlist** for the future Telegram test bot (16.9 §4).
4. **The `/api/health` marker** says `production:true` on staging (hard-coded, cosmetic).
5. **Untagged Workers Builds versions** without `AUTONOMY_ORCHESTRATOR`: a push creates another one. Never deploy them.

## 5. Staging isolation status: **ISOLATED** (unchanged)
- no secrets, no cron;
- DB only (`cddc10c5`);
- no R2 or AI;
- previews off;
- the code version `bed3bccd` = `f02546c` (**without** the 16.11 fix);
- no staging D1 writes and no deploy in this phase.

## 6. Production status
**Unchanged:** `5256ded0` @100 %, schedules unchanged, no deploy, upload or traffic change.

## 7. Files changed (local, uncommitted)
| File | Change |
|---|---|
| `worker/src/index.js` | +3/−1: payment-ledger concurrency guard (D-16.11-1) |
| `tests/harness/phase16_11.mjs` | new, 33 checks |
| `tests/harness/README.md` | run list and expected-results rows for phase16–16_11; full suite 694/694 |
| `HANDOFF-2026-10-21/PHASE-16/PHASE-16-11-SECURITY-RELIABILITY.md` | this report |

## 8. Proposed scoped Git checkpoint (16.6–16.11): **NOT executed; needs owner approval**
**Include only these:**
```
worker/src/index.js
tests/harness/phase16_11.mjs
tests/harness/README.md
staging/wrangler.staging.toml
staging/seed-staging-controls.sql
staging/postcheck-staging.sql
staging/staging-secrets.example
staging/staging-profile-rehearsal.mjs
staging/staging-nosecrets-rehearsal.mjs
HANDOFF-2026-10-21/PHASE-16/PHASE-16-6-READINESS-REPORT.md
HANDOFF-2026-10-21/PHASE-16/PHASE-16-7-UPLOAD-REPORT.md
HANDOFF-2026-10-21/PHASE-16/PHASE-16-8-ISOLATED-VALIDATION.md
HANDOFF-2026-10-21/PHASE-16/PHASE-16-9-STAGING-PLAN.md
HANDOFF-2026-10-21/PHASE-16/PHASE-16-10-STAGING-EXECUTION.md
HANDOFF-2026-10-21/PHASE-16/PHASE-16-11-SECURITY-RELIABILITY.md
```
- **Secret check:** none of these contains a secret, token or credential. They contain only the staging D1 ID, the workers.dev subdomain and the account-visible Worker names. The production D1 ID is already tracked in `worker/wrangler.toml`. Re-run a secret grep before staging the commit.
- **Exclude:** every other untracked item (BACKUP-16-1, other HANDOFF phases, `migration-plan/`, `owner-actions/` drafts, `.wrangler/`, scratchpad files).

Suggested message:
```
fix: phase 16.11 payment-ledger concurrency guard + security/reliability harness; staging config and 16.6-16.11 handoffs
```
**Effect of the push:** Workers Builds will create one more **untagged** Production version, without the orchestrator flag. It will not be deployed. Never deploy it.

## 9. Next safe development phase (recommendation)
**Phase 16.12 — refresh the release candidate (owner approvals, in order):**
1. the scoped commit and push above;
2. upload a **new** Production candidate from the fixed commit (`wrangler versions upload --var AUTONOMY_ORCHESTRATOR:on --keep-vars --tag <commit>-orch-on`, upload only), to **replace `3cb84e58`**;
3. update staging to the same code (`wrangler deploy --config staging/wrangler.staging.toml --name hamzehi-social-ai-staging`, still with no secrets), so staging and the candidate match;
4. Telegram test-bot activation stays postponed until the owner decides. The Production rollout stays a separate decision.

STOP: Phase 16.11 is complete. Phase 16.12 has not started.
