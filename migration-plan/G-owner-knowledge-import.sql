-- HAMZEHI owner knowledge import (Command Center price lists / catalogs / rules / owner product images). NOT APPLIED anywhere.
-- Additive only: three new tables + indexes. No ALTER, no DROP, no change to existing tables or rows (W40 untouched).
-- The Worker performs NO runtime DDL for these tables: until this is applied, /api/owner-knowledge/* and large owner
-- commands answer 503 "requires migration G" and nothing is stored. Safe to re-run (IF NOT EXISTS).
-- Image binaries are NOT stored here: owner images live in the existing Telegram vault channel; D1 keeps references only.

CREATE TABLE IF NOT EXISTS owner_knowledge_imports (
 id TEXT PRIMARY KEY,
 content_hash TEXT NOT NULL UNIQUE,
 client_request_id TEXT UNIQUE,
 market TEXT NOT NULL CHECK(market IN ('GLOBAL','IRAN','ARAB')),
 status TEXT NOT NULL CHECK(status IN ('processing','analyzed')),
 summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_knowledge_imports_created ON owner_knowledge_imports(created_at);

CREATE TABLE IF NOT EXISTS owner_knowledge_import_items (
 id TEXT PRIMARY KEY,
 import_id TEXT NOT NULL,
 seq INTEGER NOT NULL,
 item_type TEXT NOT NULL CHECK(item_type IN ('price_row','product_fact','visual','rule','unparsed')),
 parse_status TEXT NOT NULL CHECK(parse_status IN ('parsed','ambiguous','rejected')),
 review_status TEXT NOT NULL CHECK(review_status IN ('pending_review','approved','rejected','applied')),
 product_key TEXT,
 product_name TEXT,
 size TEXT,
 configuration TEXT,
 category TEXT,
 market TEXT NOT NULL CHECK(market IN ('GLOBAL','IRAN','ARAB')),
 currency TEXT,
 price_minor INTEGER,
 fact_domain TEXT,
 fact_attribute TEXT,
 fact_value_json TEXT CHECK(fact_value_json IS NULL OR json_valid(fact_value_json)),
 raw_line TEXT,
 issues_json TEXT NOT NULL CHECK(json_valid(issues_json)),
 observation_json TEXT CHECK(observation_json IS NULL OR json_valid(observation_json)),
 image_id TEXT,
 group_key TEXT,
 linked_item_id TEXT,
 result_ref TEXT,
 history_json TEXT NOT NULL CHECK(json_valid(history_json)),
 version INTEGER NOT NULL CHECK(version > 0),
 reviewed_by TEXT,
 reviewed_at TEXT,
 applied_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(import_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_owner_import_items_import ON owner_knowledge_import_items(import_id, seq);
CREATE INDEX IF NOT EXISTS idx_owner_import_items_review ON owner_knowledge_import_items(review_status, item_type);

CREATE TABLE IF NOT EXISTS owner_product_images (
 id TEXT PRIMARY KEY,
 sha256 TEXT NOT NULL UNIQUE,
 telegram_media_id TEXT,
 visual_media_id TEXT,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size > 0),
 analysis_status TEXT NOT NULL CHECK(analysis_status IN ('analyzed','failed','unavailable')),
 observation_json TEXT CHECK(observation_json IS NULL OR json_valid(observation_json)),
 error_code TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

-- Postcheck (read-only):
-- SELECT name FROM sqlite_master WHERE name IN ('owner_knowledge_imports','owner_knowledge_import_items','owner_product_images');
