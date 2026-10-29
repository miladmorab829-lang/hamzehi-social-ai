# PHASE 16.12-B — Controlled release candidate: UPLOAD ONLY → **UPLOADED `e221f7dd`, NOT DEPLOYED**

Date: 2026-10-29 (UTC). Wrangler 4.154.0, OAuth, account `d6820791…071c`.
**Local only. Not committed.**

## 1. Preflight (all passed)
| Check | Result |
|---|---|
| Git | branch `V10-codex-claude-integration`; local HEAD = remote HEAD = `74d854e3ba123f26f8834db0b7c4e28f037a5a0e` (after a fetch) |
| Exact committed source | `git diff HEAD -- worker` is empty; nothing untracked under `worker/` except the ignored `.wrangler/` cache. The bundle equals commit `74d854e`. |
| Production | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @**100 %** (deployment 2026-10-23T08:13:35Z) |
| Staging | `hamzehi-social-ai-staging` `bed3bccd` @100 %, secrets `[]` (unchanged) |
| Production config (reference, `versions view 5256ded0`) | 3 bindings, 10 vars and 7 secret names. Bindings: `DB` (D1 `40b272c5…`), `GALLERY_BUCKET` (R2 `hamzehi-gallery`), `AI`. Vars: the 9 `wrangler.toml` vars plus `AUTONOMY_ORCHESTRATOR="on"`. Secret names: `ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `KLING_API_KEY`, `OPENAI_API_KEY`, `SHOTSTACK_API_KEY`, `TELEGRAM_BOT_TOKEN`. |
| Script-level secrets (`wrangler secret list --name hamzehi-social-ai`, names only) | the same 7 names |

**Flag semantics checked** (`versions upload --help`, 4.154.0):
- `--name`, `--tag`, `--message` and `--var` behave as documented.
- **`--keep-vars`** only stops Wrangler from deleting dashboard-set **vars** that are absent from `wrangler.toml`. It does **not** manage secrets. Secrets are script-level, are inherited by every new version, and are never sent by this command (no `--secrets-file` was used).
- Bindings come from `wrangler.toml` (`DB`, `GALLERY_BUCKET`, `AI`), identical to Production.

**Dry run** (`--dry-run`, nothing uploaded):
- 2164.44 KiB / gzip 504.86 KiB;
- bindings `DB 40b272c5…`, `GALLERY_BUCKET`, `AI`;
- the 9 toml vars plus `AUTONOMY_ORCHESTRATOR` (hidden, i.e. supplied).

**Network:**
- **Warning:** the local system proxy was **ON**. That was the cause of the 3 failed 16.7 uploads.
- So, before using the single authorised attempt, a safe test was run: 2 × 2.3 MB **unauthenticated** POSTs to the Cloudflare API through Node fetch (the same stack as Wrangler).
- Result: 2/2 bodies were fully sent (HTTP 400 as expected, 12–15 s). Nothing was created.

## 2. Exact upload command (run ONCE, 04:45:38Z, from `worker/`; guarded by HEAD = `74d854e` and a clean `worker/`)
```
npx wrangler versions upload --name hamzehi-social-ai --var AUTONOMY_ORCHESTRATOR:on --keep-vars --tag 74d854e-orch-on --message "Phase 16.12-B 74d854e UPLOAD ONLY - NOT DEPLOYED"
```
- **Result:** `Uploaded hamzehi-social-ai (34.06 sec)`, exit 0, Worker startup time 11 ms.
- **Deviation from the suggested command:** only an added `--message`, which is metadata. There was no retry and no other upload.

## 3. New version
| Field | Value |
|---|---|
| **Version ID** | **`e221f7dd-faa8-4d60-ab9b-712193c3fa8c`** |
| Created | 2026-10-29T04:46:26.299Z |
| Source | `version_upload` |
| Tag | **`74d854e-orch-on`** (source commit `74d854e`) |
| Message | `Phase 16.12-B 74d854e UPLOAD ONLY - NOT DEPLOYED` |

## 4. Configuration comparison (`versions view` line-by-line diff vs Production `5256ded0`)
**IDENTICAL** across:
- handlers (`scheduled`, `fetch`);
- compatibility (`2026-09-11`, `global_fetch_strictly_public`);
- all 3 bindings (`DB` → `40b272c5…`, `GALLERY_BUCKET` → `hamzehi-gallery`, `AI`);
- all 10 vars, including **`AUTONOMY_ORCHESTRATOR="on"`**;
- all **7 secret names**.

**Secret values** were never displayed or transmitted.

**Code difference vs Production:** the Phase 16.1–16.5 changes plus the 16.11 payment-ledger concurrency guard (D-16.11-1).

**Defaults, as accepted in 16.6:**
- `SALES_AI_PROVIDER_COOLDOWN` is unset, so the cooldown is on;
- `SALES_AI_MAX_OUTPUT_TOKENS` is unset, so there is no cap.

## 5. Production traffic verification (after the upload)
| Item | Result |
|---|---|
| `deployments status` | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @**100 %**, deployment 2026-10-23T08:13:35Z: **unchanged** |
| New version traffic | **0 %**: `e221f7dd` is in no deployment |
| Deployment records | the latest is still 2026-10-23T08:13:35Z, so **no new deployment** |
| Staging | `bed3bccd` @100 %: unchanged |

## 6. Warnings and deviations
1. **The Windows proxy is ON** on this machine. This upload passed anyway after the network test. Future large uploads may fail as they did in 16.7; turning the proxy off avoids that.
2. **Version status:**
   - **Superseded candidate:** `3cb84e58` (f02546c, without the 16.11 fix). Do not deploy it; `e221f7dd` is the candidate now.
   - **Never deploy the untagged builds that lack `AUTONOMY_ORCHESTRATOR`:** `b103c4b6`, `99c203a3`, `39b7e425`, `51b22354`, `d9a51603`, `925196e1`, plus the old #465, #467 and #469.
3. **Staging (`bed3bccd`) is still at `f02546c`** (without the fix). Updating it was out of scope.
4. **Not performed:**
   - no `versions deploy` or `wrangler deploy`; no traffic change;
   - no staging, D1, Telegram or AI action;
   - no Git commit or push;
   - no second upload.

## 7. Next recommended action (each step needs owner approval)
1. **Optional staging parity:**
   ```
   npx wrangler deploy --config staging/wrangler.staging.toml --name hamzehi-social-ai-staging
   ```
   Run it from the repo root at `74d854e`, still with no secrets and no cron, so staging runs the same code as `e221f7dd`.
2. **The Production rollout decision for `e221f7dd`** (16.6 §8 plan, monitored window):
   ```
   npx wrangler versions deploy e221f7dd-faa8-4d60-ab9b-712193c3fa8c@100% --message "Phase 16 74d854e (orchestrator on)"
   ```
   The rollback stays:
   ```
   npx wrangler versions deploy 5256ded0-4aab-4b5a-95c1-ccd7a1752a9a@100%
   ```
   - **Before it:** a fresh `deployments status` check.
   - **After it:** the owner's Telegram test message (the Phase 15 P1 item is still open).
3. **Git:** this report (and the final 16.12-A report) can go into the next scoped checkpoint.
