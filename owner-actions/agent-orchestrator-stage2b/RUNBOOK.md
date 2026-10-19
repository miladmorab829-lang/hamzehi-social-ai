# Stage 2B — Production rollout runbook (prepared 2026-10-19, NOTHING executed)

Each checkpoint needs its **own** owner approval. Approval of one is never permission for the next.
Order: A → B → C → D. Run A in the lowest-traffic window (e.g. 02:00–05:00 Iran/Iraq time).

## Checkpoint A — fresh backup + D1 migration (owner approval #1)
The 2026-10-19 file `C:\Users\Pershian\hamzehi-backups\d1-before-mem02-2026-10-19.sql` is a **historical** restore point
(before MEM-02). It is NOT the pre-Stage-2B backup. Take a fresh one immediately before migrating:

1. Bookmark: `npx wrangler d1 time-travel info DB` → record the bookmark id here.
2. Export: `npx wrangler d1 export DB --remote --output=C:\Users\Pershian\hamzehi-backups\d1-before-stage2b-<YYYY-MM-DD>.sql`
   (may block D1 queries for seconds–minutes; afterwards confirm no lead/payment message was dropped).
3. Verify offline (no Cloudflare): sha256 the file; load it into a local SQLite / `node:sqlite`; `PRAGMA integrity_check` = ok;
   `PRAGMA foreign_key_check` = no rows; table list and row counts match precheck P4.
4. Precheck: each statement of `01-precheck.sql` with `npx wrangler d1 execute DB --remote --command "…"` (never `--file`).
   P1 must return 0 rows; P2 the 6 audit columns; P3 the MEM objects.
5. Migration: `npx wrangler d1 execute DB --remote --file=owner-actions/agent-orchestrator-stage2b/02-migration-draft.sql`
   (additive CREATE … IF NOT EXISTS only; safe to re-run).
6. Postcheck: `03-postcheck.sql` with `--command`: 6 tables, 7 named indexes, 3 action_token columns, all new tables empty,
   tables +6 / named indexes +7 / triggers unchanged vs P4.

Rollback for A: `04-rollback.sql` (drops agent_* only; separate approval; only with the flag OFF). Full restore = Time Travel
to the bookmark from step 1 — that also reverts every sales/order/payment write made after it, so it is a last resort.

## Checkpoint B — git commit + push (owner approval #2)
Files: worker/src/agent-orchestrator.js, agent-ops-store.js, secure-compare.js (new, untracked — a missing import breaks the
whole Worker), autonomy-engine.js, index.js, live-dashboard-page.js, owner-actions/agent-orchestrator-stage2b/*, .claude docs.

## Checkpoint C — Cloudflare deploy with AUTONOMY_ORCHESTRATOR OFF (owner approval #3)
`npx wrangler versions upload` → review → `npx wrangler versions deploy <id>@100%`. The flag is not in wrangler.toml, so it
stays OFF. Rollback: `npx wrangler rollback 78ab82b2-f79a-45a9-9c29-e07e5cfd8824` (code only; tables stay, unused).
Post-deploy: Telegram/quote smoke, `/api/autonomy/agents/overview` returns 200 with empty data.

## Checkpoint D — feature activation (owner approval #4)
Set secret/var `AUTONOMY_ORCHESTRATOR=on`. Turn off by removing it (immediate legacy path). Stage 3 is not part of this.

## Evidence (local, 2026-10-19)
Restored export + MEM-02/03/05 = live Production object list (except Cloudflare-internal `_cf_KV`). Draft applied twice:
row counts unchanged, integrity ok, 6 tables + 7 indexes. Real worker code on that copy: atomic approve/audit rollback,
one-shot approval, expiry, DLQ requeue, alert ack all pass (13/13); no sales/CRM/order/payment/MEM table touched.
Rollback restores the exact pre-migration schema and the migration re-applies cleanly.
