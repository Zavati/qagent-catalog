-- QAgent Foundation 07.5.1 — Catalog Foundation
-- Intentionally minimal. Domain tables start only after the ingestion and identity boundaries are frozen.

CREATE TABLE IF NOT EXISTS catalog_metadata (
  meta_key TEXT PRIMARY KEY,
  meta_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.1', CURRENT_TIMESTAMP);
