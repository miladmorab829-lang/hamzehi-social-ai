# PHASE 16.2 — Sales AI reliability: report and handoff (LOCAL + Git checkpoint)

Date: 2026-10-28 · Branch `V10-codex-claude-integration` · base `c7bdc79` (Phase 16.1).
No Cloudflare upload or deploy. No D1 access, no migration, no customer message, no paid API call. Production was not touched.

## Findings (each one locally reproduced)
| # | Area | Finding | Evidence | Status |
|---|---|---|---|---|
| A-1 | Order vs new purchase | A message with **both** a status question and a new-order phrase («وين طلبي؟ وأريد طلب جديد…», «سفارشم کجاست یه سفارش جدید هم میخوام») lost the status question. `orderStatusExplicit` returned false whenever `NEW_ORDER_CUE` appeared anywhere, so the sales reply was **auto-sent** and the order question was dropped | phase16_2 A6 failed before the fix (`continue_conversation`, `sent`) | **fixed**: only the new-order phrase itself is set aside. The message is now mixed and held for the owner (`order_status_also_asked`) |
| B-1 | Follow-ups (H3) | `adsDueFollowups` and `GET /api/ads/followups` read only the **500 most recently updated leads**. With more leads than that, an older lead whose follow-up date was due was never drafted or shown | B1/B3 with 520 newer leads | **fixed**: SQL pre-filter on follow-up stage + notes containing a follow-up date. The JS due check is unchanged |
| B-2 | Follow-ups / currency | The revenue follow-up run drafted for any order with a known market, without checking the currency. An ARAB order stored in TOMAN would get an Arabic balance request in TOMAN, and an IRAN order in USD a payment request in USD. This is a data anomaly, because quotes already enforce the currency | B10–B13 | **fixed**: a currency/market mismatch → owner-only (`data_quality: currency_market_mismatch`). `/api/orders/balance-request` refuses non-USD ARAB orders (409) |

## Verified (no change needed)
- **Follow-up mechanism:**
  - CRM/Ads follow-ups are **scheduled** (15-min tick + daily 07:00) and manual. They create **drafts only**, stored in lead notes, through the CRM_FOLLOWUP quota (55-min spacing, daily cap).
  - Revenue follow-ups (quote no reply 3 d, unpaid 2 d, balance 3 d, reorder 30 d) are **manual only** (owner button).
  - Nothing is sent automatically. There is no duplicate: the notes CAS / per-record idempotent keys prevent it, and B6 confirms it.
  - Language follows the market (B4). Revenue texts carry no numbers. The IRAN balance case is owner-only.
- **Market safety:**
  - Market comes from country/city evidence, not language (C1–C3).
  - A mixed Iraq+Iran request stays undecided (C4).
  - IRAN → TOMAN and ARAB → USD (`MARKET_CURRENCY`, quote check `currency_market_mismatch`).
  - No price, discount, deposit or payment instruction is auto-sent without approved data (C5, C6).
- **Isolation:** order lookup is by lead AND conversation. A customer without an order never sees another customer's order (A4).

## Changes
- `worker/src/index.js`, +15/−5:
  - `orderStatusExplicit` + `NEW_ORDER_CUE_ALL`
  - `LEAD_HAS_FOLLOWUP_SQL` used by `adsDueFollowups` and `GET /api/ads/followups`
  - currency check in `findStalledRevenueItems` item audience
  - USD check in `prepareBalanceRequest`
- `tests/harness/phase16_2.mjs`: new, 37 tests.

Effect on the Approval Gate: stricter only. More messages are held; no new auto-send path or action. No schema, route, cron or binding change.

## Tests
Full local harness: **556/556 PASS** across 17 suites (519 before + 37 new). Breakdown:
- phase16: 82
- phase16_2: 37
- phase14: 50
- phase12: 64
- phase13: 49
- phase09: 55
- phase04: 44
- phase05: 30
- phase06: 27
- phase07: 26
- phase02: 21
- phase08: 21
- adsquota: 13
- quotarace: 11
- phototimeout: 10
- vaultsender: 9
- crmdisc: 7

## Remaining risks / owner decisions
- **Unchanged rule:** a lone new-order cue still routes to sales. A mixed message is held rather than answered with a clarification question; a clarification text would need the owner's wording.
- **Lead window:** the 500-lead window still applies, but now only to leads that have a follow-up date. Ordering is most-recent first.
- **H1 (owner decision):** scheduled revenue follow-up drafts (daily sweep).
- **H2 (owner decision):** second-stage nudges.
- **F3 (owner decision):** IRAN balance draft.
- **I3 (owner decision):** Sales-AI cost cap.
- **Phase 15 P1 (still open):** live Telegram verification of Persian/Iraqi Sales AI on a fresh test account, after an owner-approved upload/deploy.
- **Phase 16.0 (open):** test-data flag on lead `b461fecf` and the 265 USD order (owner D1 write).

## Cloudflare / Production
Nothing was uploaded or deployed and Cloudflare was not queried in this phase. Production is assumed unchanged at `5256ded0` (#470), as last reported.
The Phase 16.1 upload `68aff866` is as reported by the owner and was not verified here. Rollback target remains #468 `7d31d5fb`.

## Next
Phase 16.3 (needs owner decisions C3/B3) or an owner-approved upload of `c7bdc79`+16.2 for the Phase 15 live Telegram test. Not started.
