-- HAMZEHI STAGING ONLY — read-only checks against the STAGING D1 (hamzehi-staging). SELECT statements only.
-- 1. schema present (expected 66 after schema.sql + stage2b + seed, the Worker adds the rest on first use)
SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';
-- 2. required indexes for the 16.x code
SELECT name FROM sqlite_master WHERE type='index' AND name IN ('ux_agent_alerts_open','ux_agent_approvals_live','ux_agent_versions_active') ORDER BY name;
-- 3. empty customer tables (proves no production data was copied)
SELECT (SELECT COUNT(*) FROM leads) AS leads,(SELECT COUNT(*) FROM inbox_messages) AS inbox,(SELECT COUNT(*) FROM lead_orders) AS orders,
       (SELECT COUNT(*) FROM lead_order_payments) AS payments;
-- 4. autonomy master gate closed
SELECT key,value FROM autonomy_controls WHERE key='master';
