# PHASE 16.3 — Reliability, follow-up and sales safety: report and handoff

Date: 2026-10-28 · Branch `V10-codex-claude-integration` · base `cfc69fa` (Phase 16.2).
No Cloudflare upload or deploy. No D1 access, no migration, no customer message, no paid API call. Production was not queried in this phase.

## Fixes (each one reproduced locally first)
| # | Area | Defect | Fix |
|---|---|---|---|
| 1 | Market routing | «عندي محل ببغداد وفرع بطهران…» stored **بغداد** and the ARAB market. An Iranian city written with an Arabic preposition («بطهران», «لمشهد») was not recognised, so the mixed Iran+Iraq check missed it | `CUSTOMER_IRAN_CITY_PREFIXED`: optional و/ف + ب/ل + the longer Iranian city names. It is detection only and used only in `customerDestinationBothMarkets`, so it can only make a message *undecided*, never pick a market |
| 2 | Follow-ups | Once a CRM follow-up draft existed, a **new date set by the owner** was never drafted: `followup_draft` blocked every later run, with no error | `updateLeadRecord`: setting a *different* `next_followup_at` archives the previous draft into `followup_history` (last 5) and clears it. Re-saving the same date changes nothing. Still draft-only. This is not an automatic second nudge (H2) |

## Verified (no change needed)
- **Repeated or concurrent revenue runs** (3 runs in parallel + 1 repeat): one draft per record. This rests on the deterministic outreach id + `INSERT OR IGNORE` + the event key.
- **CRM follow-up runs:** a concurrent scheduled tick + 2 manual runs give one draft, at most one provider call per lead, and nothing sent. The CRM_FOLLOWUP quota gate and the notes CAS cover this.
- **Language:** ARAB → Iraqi Arabic; IRAN → Persian.
- **Unpaid order with no owner-approved payment terms:** owner decision, no payment request.
- **Routing:**
  - status + new product → held;
  - thanks + new product → sales;
  - «وين وصلت الشحنة» → status or held;
  - unclear product → no price;
  - «لكربلاء» and «وبالنجف» → correct city;
  - a single Iraqi city among ordinary ب/ل words is not marked mixed;
  - 4 mixed-market phrasings → undecided.
- **Finance:**
  - an IRAN customer gets no USD price and no converted price;
  - no discount, deposit or account details are invented;
  - a chat «الغي الطلب» or «غير الكمية/السعر» never changes the order;
  - multi-intent replies carry only approved USD numbers.

## Changed files
- `worker/src/index.js`: `CUSTOMER_IRAN_CITY_PREFIXED` and `customerDestinationBothMarkets`; `updateLeadRecord`.
- `tests/harness/phase16_3.mjs`: new, 32 tests.
- `HANDOFF-2026-10-21/PHASE-16/PHASE-16-3-REPORT.md`: this report.

## Tests
- phase16_3: 32/32.
- Full local harness, run once at the end: **588/588 PASS** across 18 suites (556 + 32).

## Remaining risks / owner decisions
- **H1 (owner decision):** scheduled revenue follow-up drafts. Not activated.
- **H2 (owner decision):** automatic second nudge. Not implemented.
- **F3 (owner decision):** IRAN balance draft.
- **I3 (owner decision):** Sales-AI cost cap.
- **B3 (owner decision):** country-only market evidence.
- **C3 (owner decision):** IRAN formal quote from the approved price.
- A mixed or ambiguous message is held for the owner rather than answered with a clarification question; a clarification text needs the owner's wording.
- The city and phrase lists are finite. Unknown phrasings fall to the sales path, or to the owner hold when an order is open.
- `updateLeadRecord` is not compare-and-set: two owner edits saved at the same moment are last-write-wins. This behaviour is unchanged.
- **Still open:**
  - Phase 15 live Telegram verification, which needs an owner-approved upload/deploy.
  - Phase 16.0 test-data flags (an owner D1 write).

## Cloudflare / Production
- **Not performed:** upload, deploy, D1, cron/route/secret changes.
- **Not verified in this phase:** that Production is `5256ded0` and that `68aff866` is the last upload. Both are as reported by the owner.

## Next recommended
An owner-approved `wrangler versions upload` of this checkpoint (no deploy), then a fresh-account Telegram test in Persian and Iraqi Arabic (Phase 15 P1), then an owner deploy decision. Phase 16.4 is not started.
