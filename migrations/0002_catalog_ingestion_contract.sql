-- QAgent Foundation 07.5.2 — Catalog Ingestion Contract v1
-- Durable idempotent inbox for derived Normalizer facts.
-- No raw request/response payloads are stored here.

CREATE TABLE IF NOT EXISTS catalog_ingestion_events (
  event_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'qagent.catalog-update.v1'),

  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,

  normalized_event_id TEXT NOT NULL,
  normalized_endpoint_id TEXT NOT NULL,
  observation_session_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,

  method TEXT NOT NULL,
  scheme TEXT NOT NULL,
  host TEXT NOT NULL,
  normalized_path TEXT NOT NULL,

  observed_at TEXT NOT NULL,
  status_code INTEGER,
  network_failure INTEGER NOT NULL CHECK (network_failure IN (0, 1)),
  origin_relation TEXT NOT NULL CHECK (origin_relation IN ('SAME_ORIGIN', 'SAME_SITE_HEURISTIC', 'EXTERNAL', 'UNKNOWN')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  resource_type TEXT NOT NULL,
  request_content_type TEXT,
  response_content_type TEXT,

  request_schema_hash TEXT,
  request_schema_json TEXT,
  response_schema_hash TEXT,
  response_schema_json TEXT,

  emitted_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN ('PENDING', 'PROCESSED', 'FAILED')),
  processed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_ingestion_source_event
  ON catalog_ingestion_events (organization_id, project_id, environment_id, normalized_event_id);

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_project_pending
  ON catalog_ingestion_events (organization_id, project_id, processing_status, received_at);

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_endpoint_source
  ON catalog_ingestion_events (normalized_endpoint_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_environment
  ON catalog_ingestion_events (organization_id, project_id, environment_id, observed_at);

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.2', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
