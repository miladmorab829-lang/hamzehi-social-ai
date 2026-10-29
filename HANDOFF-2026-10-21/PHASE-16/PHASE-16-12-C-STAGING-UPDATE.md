# PHASE 16.12-C — Isolated staging updated to commit `74d854e`

Date: 2026-10-29 (UTC). Wrangler 4.154.0. **Local only. Not committed.** Target: **`hamzehi-social-ai-staging` only.**

## 1. Git source commit
- **Commit:** branch `V10-codex-claude-integration`, HEAD = remote = **`74d854e3ba123f26f8834db0b7c4e28f037a5a0e`**.
- **Clean source:** `git diff HEAD -- worker staging` is empty, and nothing is untracked in `worker/` or `staging/`. The deployed bundle is the exact committed code.
- **Fix included:** the payment-ledger concurrency guard (D-16.11-1) is present in `worker/src/index.js`: the `INSERT … AND (SELECT COALESCE(SUM(amount_minor),0) FROM lead_order_payments WHERE order_id=?)=?` condition.
- **Config as committed:**
  - `staging/wrangler.staging.toml`: name `hamzehi-social-ai-staging`, D1 `cddc10c5-2232-4334-8d99-fedb52fbd12d`, **`crons = []`**;
  - `workers_dev=true`, `preview_urls=false`;
  - no R2 and no AI binding;
  - `SALES_AI_BRAIN="off"`, `AUTO_AI_MEDIA_ENABLED="false"`, `SALES_AI_UNDERSTANDING="off"`.

## 2. Safety gates (before the deploy)
| Gate | Result |
|---|---|
| `node staging/staging-nosecrets-rehearsal.mjs` on the `74d854e` code | **14/14 PASS**. Every admin route returns 401 without a token; the webhook is refused (no secret, a guessed secret, the harness secret); both cron schedules are inert; **zero outbound calls**; zero AI requests; no lead, order, payment or outreach rows. |
| Dry run (`wrangler deploy --dry-run --config staging/… --name hamzehi-social-ai-staging`) | 2164.58 KiB / gzip 504.92 KiB; the only binding is `DB (hamzehi-staging)` plus the staging vars |
| Telegram | no bot token or webhook secret, so nothing can be sent or received |
| Paid AI | no provider keys, no AI binding, `SALES_AI_BRAIN=off` |
| Financial actions | every payment and order route needs `ADMIN_TOKEN`, which is unset in staging, so they all return 401 |
| Production data | not bound: `DB` = `cddc10c5…` ≠ `40b272c5…`; no R2 |

## 3. Staging version before and after
| | Version | Code |
|---|---|---|
| Before | `bed3bccd-90da-423e-a73b-da9c93b0fc55` (2026-10-28T18:34Z) | `f02546c` (without the 16.11 fix) |
| **After** | **`fb802744-5b36-4c54-b4e4-33e5aa468f24`**, deployment 2026-10-29T04:53:07.804Z, @100 % | **`74d854e`** (with the fix) |

## 4. Exact deployment command
Run once at 04:52:34Z from the repo root. The guard script aborted unless:
- name = `hamzehi-social-ai-staging`;
- D1 = `cddc10c5…`;
- `crons = []`;
- HEAD = `74d854e`;
- `worker/` and `staging/` are clean.

```
npx --prefix worker wrangler deploy --config staging/wrangler.staging.toml --name hamzehi-social-ai-staging --message "Phase 16.12-C staging 74d854e - deterministic, no secrets"
```

**Result:**
- `Uploaded hamzehi-social-ai-staging (23.37 sec)`;
- `Deployed hamzehi-social-ai-staging triggers (3.34 sec)`;
- startup time 10 ms.

## 5. Binding and secret verification (`versions view fb802744`, `secret list`)
- **Only binding:** `env.DB (cddc10c5-2232-4334-8d99-fedb52fbd12d)`. There is **no** production D1, **no** R2 and **no** Workers AI.
- **Vars** (11, unchanged): `HAMZEHI_ENVIRONMENT=staging`, `SALES_AI_BRAIN=off`, `AUTO_AI_MEDIA_ENABLED=false`, `SALES_AI_UNDERSTANDING=off`, `AUTONOMY_ORCHESTRATOR=on`, `SALES_AI_MAX_OUTPUT_TOKENS=800`, `RATE_LIMIT_PER_MINUTE=30`, `SALES_AI_PROVIDER`, `ANTHROPIC_MODEL`, `SALES_AI_TIMEOUT_MS`, `PUBLIC_WORKER_BASE_URL`.
- **Secrets:** **`[]`**. There is no Telegram token, no webhook secret, no `ADMIN_TOKEN` and no AI key.
- **Webhook:** none can be registered, because there is no bot token and `/api/telegram/webhook/setup` needs the absent `ADMIN_TOKEN`.

## 6. Cron verification (read-only API)
| Script | Schedules |
|---|---|
| `hamzehi-social-ai-staging` | **`[]`** (still empty after the deploy) |
| `hamzehi-social-ai` (Production) | `0 7 * * *`, `*/15 * * * *`: unchanged |

**Preview URLs:** `previews_enabled:false` on both.

## 7. Health and authentication checks (read-only GETs only; no webhook POST)
| Request (staging) | Status |
|---|---|
| `GET /api/health` | **200** |
| `GET /api/autonomy/agents/overview` (no token) | 401 |
| `GET /api/orders` (no token) | 401 |
| `GET /api/orders/payments` (no token) | 401 |
| `GET /api/telegram/inbound-health` (no token) | 401 |
| `GET /api/orders` (wrong token) | 401 |

## 8. Production verification
- `deployments status`: **`5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @100 %**, deployment 2026-10-23T08:13:35Z. **Unchanged.**
- Newest Production version: `e221f7dd` (the 16.12-B candidate), still at **0 %**.
- Production schedules and the preview setting are unchanged.
- There was no Production command other than these read-only checks.

## 9. Remaining limitations
- **Staging cannot run functional tests yet:** with no `ADMIN_TOKEN` and no test-bot token, the T1–T10 scenarios (16.9 §5) are not possible. This is intentional until the owner approves Telegram test activation.
- **Staging D1 has the schema only:** no synthetic data, and no schema change in this phase.
- **Cosmetic:** `/api/health` on staging still reports `production:true` (hard-coded).
- **Windows proxy:** it was on during 16.12-B. This deploy (2.2 MB) went through anyway.

## 10. Not performed
- no Production deploy or traffic change;
- no D1 write and no staging schema change;
- no Telegram action and no AI call;
- no Git commit or push;
- no unrelated file changes;
- the protected original was not accessed.

STOP: Phase 16.12-C is complete.
