-- HAMZEHI STAGING ONLY — run against the STAGING D1 (hamzehi-staging) after database/schema.sql, BEFORE the first staging deploy.
-- Never run against production (40b272c5-e368-4c33-8a41-7c63db98d7e8). Contains no customer data; only switches.
-- Closes the autonomy master gate so the */15 cron runs only the watchdog and bounded recovery steps (no autopilot, ads,
-- follow-up drafting or weekly video). Same DDL as worker/src/autonomy-engine.js ensureNow().
CREATE TABLE IF NOT EXISTS autonomy_controls(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
INSERT OR REPLACE INTO autonomy_controls(key,value,updated_at) VALUES('master','off',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
