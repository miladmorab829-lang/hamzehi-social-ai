# PHASE 16.16-A — Staging Telegram sender allow-list (security hardening)

**Date:** 2026-10-29.
**Mode:** owner-authorised local implementation and tests only.
**Report:** local only, not committed.

**Not done:**
- no deployment, upload, commit or push;
- no D1, secret, cron, webhook or Telegram action, and no AI call;
- the protected original was not accessed;
- no real Telegram ID was added anywhere.

## 1. Starting Git and Cloudflare state (verified read-only)
| Item | Observed |
|---|---|
| Branch / HEAD | `V10-codex-claude-integration` / `b29e9bf0cfe2fd9560c2adc64398df7af0f9eb4d` = `FETCH_HEAD` (remote) |
| Local changes at start | only the Phase 16.15 health fix in `worker/src/index.js` (5 lines). Untracked at start: 64 (62 before 16.15 + its test + its report) |
| Production | `5256ded0-4aab-4b5a-95c1-ccd7a1752a9a` @100 %, deployment 2026-10-23T08:13:35Z: unchanged |
| Staging | `dfe1c2e0-781e-412e-a478-769959c55483` @100 %, deployment 2026-10-29T07:15:08Z; secrets `[]`: unchanged |
| Candidate | `837a8e6d` 0 % (in no deployment) |

- The Phase 16.15 report exists locally: `PHASE-16-15-READINESS-SECURITY.md`, written in this session on this laptop.
- No unexpected difference, so implementation was allowed to proceed.

## 2. Existing webhook security architecture (before this phase)
- **Entry point:** `POST /webhooks/telegram` → `handleTelegramWebhook`.
  - This is the only inbound path: no polling and no callback handler.
  - `setWebhook` registers `allowed_updates = message, edited_message, channel_post, edited_channel_post`.
- **Router-level steps before every route:** the per-IP rate limiter `rate()` writes a counter to `api_rate_limits`.
- **Authentication:**
  - The `X-Telegram-Bot-Api-Secret-Token` header is compared with `!==` (not constant-time).
  - The secret comes from `TELEGRAM_WEBHOOK_SECRET_TOKEN`. If that is unset, it **falls back to one generated and stored in D1** (`system_kv`, `telegramWebhookSecret`).
- **Parsing:**
  - `m = channel_post || edited_channel_post || message || edited_message`; an update without `m.chat` is ignored.
  - A non-private chat that is not a configured internal chat is ignored.
- **Sender identification:**
  - The *customer* identity is a private chat with a human `from` where `from.id == chat.id`.
  - The vault groups have their own numeric-ID allow-list (`TELEGRAM_VAULT_SENDER_IDS`, fail-closed).
  - **Private chats had no sender allow-list: any Telegram user is a customer** (correct for Production, unsafe for a staging test bot).
- **Side effects, in order:**
  1. `noteTelegramWebhook('accepted')` (D1);
  2. media rows;
  3. lead match / creation;
  4. inbox insert (atomic deduplication by `external_id`);
  5. then the Sales Brain / AI, drafts, the acknowledgement and replies (`sendMessage`).
- **Owner/admin routing:** a separate Bearer `ADMIN_TOKEN` (constant-time `bearerMatches`); not reachable from webhook payloads.

## 3. Gap addressed
1. **G1 (sender):** with `HAMZEHI_ENVIRONMENT=staging` and a test bot connected, **any** Telegram user could DM the bot. That would create leads, inbox rows, AI calls (cost) and replies.
2. **G2 (auth):** a staging Worker without its own webhook secret silently used a **D1-generated secret** (and wrote it to D1 on the first request) instead of failing closed.
3. **G3 (hardening):** the webhook secret comparison was not constant-time.

## 4. Implementation (`worker/src/index.js`; diff +39 / −6 including 16.15's 5 lines)
- **Reuse:**
  - `vaultSenderAllowList` now delegates to a new `parseTelegramUserIdList(value)`. This is the same parser, reasons and rules as before:
    - numeric IDs only (`^[1-9]\d{4,14}$`);
    - Telegram service IDs `777000` / `1087968824` invalidate the list;
    - a missing or invalid list fails closed.
  - The vault behaviour is unchanged (vaultsender 9/9).
- **`isStagingWorker(env)`:** `env.HAMZEHI_ENVIRONMENT === "staging"`. It reads only the Worker var (Wrangler config), **never** the request.
- **`stagingSenderVerdict(env, body)`** is pure: no D1, no network, O(1) `Set` lookup. It refuses on, in order:
  - an invalid or missing list;
  - an update that does not carry exactly one payload (`ambiguous_update`);
  - any type other than `message` / `edited_message` (`unsupported_update_type`, e.g. `callback_query`, channel posts, `inline_query`, `my_chat_member`);
  - a malformed message;
  - `sender_chat` (anonymous or channel sender);
  - a missing `from` / `from.id`;
  - a bot sender;
  - a non-numeric or negative ID;
  - an ID not in the list (`sender_not_allowed`).
  - It uses **`from.id` only**. Username, name, chat title and chat ID are never consulted.
- **In `handleTelegramWebhook`:**
  1. **Staging + no `TELEGRAM_WEBHOOK_SECRET_TOKEN`** → `503 Webhook not configured`, before any D1 access (no generated-secret fallback).
  2. The secret is compared with `safeTokenEqual` (constant-time, existing `secure-compare.js`). For a non-empty expected secret (always the case), the result is identical to the old `!==`.
  3. **Staging sender guard right after JSON parse:** placed **before** `noteTelegramWebhook('accepted')` and every later step (media, lead, inbox, AI, orders, payments, scheduling, replies).
     - A refusal returns `200 {ok:true, ignored:true, reason}`, so Telegram does not redeliver.
     - The log line is `staging_telegram_sender_rejected:<reason>`: no ID, name or text.
- **In `setupTelegramWebhook` (owner-only):** in staging, it refuses `503` unless **both** the env secret **and** a valid `STAGING_TELEGRAM_ALLOWED_USER_IDS` exist. A staging webhook can therefore never be registered with the D1 fallback secret or without an allow-list.
- **Production (var unset or not `"staging"`):** none of the new branches run. The only code-path change is the equivalent constant-time compare.

## 5. Configuration behaviour
| `HAMZEHI_ENVIRONMENT` | `STAGING_TELEGRAM_ALLOWED_USER_IDS` | Result |
|---|---|---|
| unset / `production` / anything but `staging` | ignored even if set | Production behaviour (every human private sender is a customer) |
| `staging` | unset / empty / whitespace | every update refused (`allow_list_missing`) |
| `staging` | any invalid entry (`abc`, short, negative, `7e8`, decimal, leading 0, `;`, service IDs) | **the whole list** refused (`allow_list_invalid`) |
| `staging` | e.g. `"<id1>,<id2>"` (comma or space separated) | only `message`/`edited_message` whose `from.id` is listed |
| `staging` | no `TELEGRAM_WEBHOOK_SECRET_TOKEN` | webhook 503, setup 503 |

- **Future activation (not done):** set `STAGING_TELEGRAM_ALLOWED_USER_IDS` as a staging-only **secret**, or as a var in `staging/wrangler.staging.toml` only. It contains the tester's numeric ID; the owner provides it at that time.
- It must **never** be added to `worker/wrangler.toml` / Production. Even if it were added, Production ignores it (test T12).
- The var name is exact-match: `HAMZEHI_ENVIRONMENT` must be exactly `staging`, which is what `staging/wrangler.staging.toml` sets.

## 6. Webhook authenticity requirements
- Sender filtering is **not** authentication. A forged JSON body with an allowed `from.id` is stopped by the secret header check, which comes first (T7: 6 forged or missing header variants → 401, nothing processed).
- In staging, the secret must come from `TELEGRAM_WEBHOOK_SECRET_TOKEN` (env). Otherwise everything returns 503 (T7b, T17).
- **Next step (owner-gated, 16.16-B):**
  1. create a **new test bot** (never the Production token);
  2. set the 3 staging-only secrets (`TELEGRAM_BOT_TOKEN` of the test bot, a fresh random `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `ADMIN_TOKEN`) plus `STAGING_TELEGRAM_ALLOWED_USER_IDS`;
  3. call `/api/telegram/webhook/setup` on staging, which passes `secret_token` to `setWebhook`.
- **Residual:** anyone holding the test-bot token could re-point the webhook or call the Bot API directly. Keep the token staging-only and rotate it after the test window.

## 7. Targeted test results: `tests/harness/phase16_16.mjs`
- **With the fix:** **45/45 PASS** (about 6 s).
- **Same harness against unpatched `HEAD` source** (exported to the scratchpad, `SRC=` override): **28/45 FAIL**. The guard is what the tests detect.
- The 17 checks that pass on both versions are positive controls and Production-unchanged checks: T1, T7, T8b, T10b, T12–T12e, T13 (edited_message), T15, T16, T16b, T17b, T17c, T18.

| Req | Check(s) | Result |
|---|---|---|
| T1 | allowed sender + valid secret processed (inbox, lead, AI); positive control for the fingerprint | PASS |
| T2 | unknown sender refused, nothing stored | PASS |
| T3 | list unset / empty / whitespace / separators-only → intended tester refused, zero side effects | PASS (4) |
| T4 | 10 invalid list forms → whole list rejected | PASS (10) |
| T5 | username / name spoofing (sender and chat) | PASS |
| T6 | chat ID = allowed ID with a stranger or no sender (private and group) | PASS |
| T7 | 6 forged or missing secret headers → 401; staging without env secret → 503, no D1-generated secret | PASS (2) |
| T8 | refused sender: schema + **full content of every table** unchanged; D1 change counter +1 exactly (= the global per-IP rate-limit counter, see §11) | PASS (2) |
| T9 | zero AI requests | PASS |
| T10 | zero Telegram calls, zero network requests; response carries no ID or text | PASS (2) |
| T11 | the same unauthorised update ×3 concurrently + a redelivery → all refused, zero side effects | PASS |
| T12 | Production profile: staging list ignored, unlisted sender is a normal customer; wrong secret 401; `callback_query` unchanged; `HAMZEHI_ENVIRONMENT=production` same; D1-generated secret fallback kept in Production | PASS (5) |
| T13 | `edited_message` from an allowed sender accepted; `callback_query` (even from an allowed ID), channel posts, `inline_query`, `my_chat_member`, empty and two-payload updates refused | PASS (3) |
| T14 | missing / null / bot / anonymous / non-numeric / negative sender and malformed message → fail closed | PASS |
| T15 | two allowed testers → separate leads and conversations; replies only to their own chat | PASS |
| T16 | payment claim, discount demand, "confirm", "mark paid" → no payment, no confirmed order, no approved quote; owner financial routes 401 without the admin token | PASS (2) |
| T17 | staging setup refused without a list, with an invalid list or without a secret (no `setWebhook`, zero writes); valid → proceeds (mock); Production setup unchanged | PASS (5) |
| T18 | no request left the machine across every test world in the file | PASS |

- **During development (not hidden):**
  - The first two runs failed because of test bugs, not guard bugs:
    - `undefined` triggered the default list;
    - `"sec "` is trimmed by the Fetch `Headers` spec, so it equals `"sec"`;
    - a scripted patch did not apply because `python` is the Windows Store stub here.
  - The test file was rewritten; no source change was needed for those failures.

## 8. Full regression results
Full run once: 2026-10-29T16:18:49Z → 16:21:15Z (about 146 s), Node v24.21.0.

| Suite | Result |
|---|---|
| 22 baseline files (crmdisc … phase16_13) | 707/708: **1 FAIL in `phase16_11`** (G1) |
| phase16_15 | 6/6 |
| phase16_16 | 45/45 |
| staging no-secrets rehearsal / staging-profile rehearsal | 14/14 / 15/15 |

**The one failure, fully explained:**
- **Cause:** `phase16_11` G1 ("staging without a webhook secret refuses every delivery and stores nothing") asserted the old status **401**. The code now returns **503** (`[503,503,503]`).
- **Why that is intended:** the D1-generated-secret fallback is gone for staging. The refusal and the "stores nothing" part were still true.
- **Fix:**
  - test only: G1 now asserts 503 and additionally that **no D1-generated secret** is stored;
  - no source change.
- **Affected harness re-run:** `phase16_11` **33/33**.
- **Why the full suite was not repeated:** no production source changed after the full run.

**Final totals:**
- **759/759** harness checks (708 baseline + 6 from 16.15 + 45 from 16.16-A);
- staging rehearsals 14/14 and 15/15.

## 9. Performance
- The guard runs only in staging: one string split and one `Set` lookup per update.
- No D1 query, no network, no AI and no agent trigger.
- Refused updates return before any D1 access in the webhook. The pre-existing router rate limiter runs for every request, as before.
- In Production the added work is one string comparison (`isStagingWorker`) plus the constant-time compare of a 64-character secret. Both are negligible, and the response path is unchanged.

## 10. Files modified
| File | State |
|---|---|
| `worker/src/index.js` | tracked, modified, uncommitted (16.16-A guard + the 16.15 health fix) |
| `tests/harness/phase16_16.mjs` | new, untracked |
| `tests/harness/phase16_11.mjs` | tracked, modified, uncommitted (G1 expects the new 503 + no D1-generated secret) |
| `HANDOFF-2026-10-21/PHASE-16/PHASE-16-16-A-TELEGRAM-ALLOWLIST.md` | new, untracked (this report) |

- `tests/harness/phase16_15.mjs` and the 16.15 report are from the previous phase (untracked).
- Nothing else changed (besides the G1 test update above):
  - no config (`worker/wrangler.toml` and `staging/wrangler.staging.toml` unchanged);
  - no workflows;
  - no rehearsal scripts.

**Scoped Git checkpoint proposal (owner approval needed; never `git add -A`, the repository is public):**
```
git add worker/src/index.js tests/harness/phase16_11.mjs tests/harness/phase16_15.mjs tests/harness/phase16_16.mjs \
        HANDOFF-2026-10-21/PHASE-16/PHASE-16-15-READINESS-SECURITY.md HANDOFF-2026-10-21/PHASE-16/PHASE-16-16-A-TELEGRAM-ALLOWLIST.md
git commit -m "fix: phase 16.15 health environment + 16.16-A staging Telegram sender allow-list"
```
- Optionally add the README harness rows.
- After a push, Workers Builds creates another **untagged version without `AUTONOMY_ORCHESTRATOR`. Never deploy it.**

## 11. Remaining limitations
1. **Global rate-limit write:**
   - A refused update still increments the pre-existing per-IP counter in `api_rate_limits`. This is router-level, and it also happens for 401s and every other route.
   - It holds only IP key, window and count (T8b). It is deliberately kept: moving the guard ahead of it would let floods of refused requests bypass rate limiting.
   - All **webhook** writes are zero.
2. **Forged requests with a wrong secret:** they still write the existing bounded rejection-evidence row (`noteTelegramWebhook('secret_mismatch')`, one per reason per minute, no payload). This is unchanged existing monitoring.
3. **Group chats:** in staging, an allow-listed tester's message in a group passes the sender check. It then follows the normal group path (stored unlinked or ignored, never a customer identity). Other members are refused.
4. **Staging-profile rehearsal:** `staging/staging-profile-rehearsal.mjs` does not set `HAMZEHI_ENVIRONMENT`, so it exercises the Production code path. Update it in 16.16-B to the real staging profile (staging + list + secret).
5. **Live behaviour:** the guard is **verified locally only**. It is not deployed to staging or in candidate `837a8e6d`, and it was not tested against real Telegram.

## 12. Staging isolation status
Unchanged and verified read-only:
- `dfe1c2e0` @100 %; secrets `[]`;
- D1 `cddc10c5` only;
- no cron, AI or R2 (per 16.14-C).

The new guard will reach staging only after an approved commit, upload and deploy.

## 13. Production verification
- Production `5256ded0` @100 % is unchanged; no deployment, version or traffic change.
- Locally, Production behaviour is unchanged (T12–T12e, T17c and the full suite).

## 14. Owner approvals required
1. A scoped commit/push of §10 (16.15 + 16.16-A).
2. A new candidate upload (with `--var AUTONOMY_ORCHESTRATOR:on` and a tag) and a staging deploy containing the guard.
3. Creating the test bot, and setting the staging-only secrets plus `STAGING_TELEGRAM_ALLOWED_USER_IDS` (the owner supplies the tester's numeric ID).
4. Registering the staging webhook (via the guarded setup route), then the live T1–T10 window, then `deleteWebhook`.
5. Separately: the AI-02.5 budget; the `main` workflow / orchestrator flag decision (16.15 #3/#4); the open business decisions (H1, H2, F3, I3, B3, C3).

## 15. Recommended next phase
**16.16-B (owner-gated): staging activation preparation.**
1. A scoped commit and push.
2. A tagged candidate upload and a staging deploy of the new code.
3. A read-only check that staging rejects everything (no list, no secret → 503).
4. Then, with explicit approval: the test bot, the staging secrets and the allow-list, `setup`, the live T1–T10 window, then `deleteWebhook`.

**STOP. 16.16-B was not started.**
