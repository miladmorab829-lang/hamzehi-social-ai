# Owner action (DRAFT, NOT APPLIED): owner-case reason code `processing_failed`

Purpose: close the residual message-loss path. Today an inbound customer message whose processing fails on both attempts has no reply
draft and no owner case; the Worker only raises the `inbound_unanswered` watchdog alert (detection only, existing tables).
With this migration the Worker could open a durable owner case `processing_failed` for that message.

Status: designed and tested locally only (`tests/harness/claimval_processing_failed_migration.mjs`, in-memory SQLite). No Production
DDL, no D1 write. Requires owner approval, a D1 backup, and an owner-run `wrangler d1 execute` of `02-migration-draft.sql`, then
`03-postcheck.sql`. Rollback: `04-rollback.sql` (only with zero `processing_failed` rows).

Code follow-up (NOT implemented in this mission, must ship only after the migration): in the webhook catch after the second
`processNegotiationInbound` failure, detect the new CHECK (sqlite_master SQL contains `processing_failed`) and create one open owner
case for the message (idempotent through `idx_owner_escalations_open_source_reason`); add the code to `OWNER_ESCALATION_REASONS`;
test: forced exception ⇒ exactly one open case, retry ⇒ no duplicate, customer receives nothing automatically.
