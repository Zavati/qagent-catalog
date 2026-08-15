-- QAgent Foundation 07.5.6 — Schema Consolidation & Versioning
-- Structural schemas become durable endpoint contracts. Raw request/response
-- payloads never enter this layer; only Normalizer-derived structure is retained.
-- Version numbers are immutable and assigned on first Catalog discovery of a
-- structural hash. True chronology remains available via first_seen_at/last_seen_at.

CREATE TABLE IF NOT EXISTS catalog_endpoint_schema_tracks (
  schema_track_id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  direction TEXT NOT NULL CHECK (direction IN ('REQUEST', 'RESPONSE')),
  status_key TEXT NOT NULL,
  status_code INTEGER,

  versioning_strategy TEXT NOT NULL
    CHECK (versioning_strategy = 'STRUCTURAL_HASH_FIRST_DISCOVERY'),
  versioning_version TEXT NOT NULL
    CHECK (versioning_version = 'schema-versioning-v1'),

  current_schema_version_id TEXT,
  current_schema_hash TEXT,
  current_version_number INTEGER,
  current_observed_at TEXT,
  distinct_version_count INTEGER NOT NULL DEFAULT 0,

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (endpoint_id, direction, status_key),
  CHECK (
    (direction = 'REQUEST' AND status_key = 'REQUEST' AND status_code IS NULL)
    OR
    (direction = 'RESPONSE' AND status_key LIKE 'HTTP:%' AND status_code BETWEEN 100 AND 599)
  )
);

CREATE INDEX IF NOT EXISTS idx_catalog_schema_tracks_endpoint
  ON catalog_endpoint_schema_tracks (organization_id, project_id, endpoint_id, direction, status_code);

CREATE TABLE IF NOT EXISTS catalog_schema_versions (
  schema_version_id TEXT PRIMARY KEY,
  schema_track_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  direction TEXT NOT NULL CHECK (direction IN ('REQUEST', 'RESPONSE')),
  status_key TEXT NOT NULL,
  status_code INTEGER,
  version_number INTEGER NOT NULL CHECK (version_number > 0),

  schema_hash TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  is_partial INTEGER NOT NULL CHECK (is_partial IN (0, 1)),
  node_count INTEGER NOT NULL CHECK (node_count >= 1),
  property_count INTEGER NOT NULL CHECK (property_count >= 0),
  max_depth INTEGER NOT NULL CHECK (max_depth >= 0),

  predecessor_schema_version_id TEXT,
  introduced_by_event_id TEXT NOT NULL,
  first_event_id TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (schema_track_id, schema_hash),
  UNIQUE (schema_track_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_catalog_schema_versions_endpoint
  ON catalog_schema_versions (organization_id, project_id, endpoint_id, direction, status_code, version_number);
CREATE INDEX IF NOT EXISTS idx_catalog_schema_versions_hash
  ON catalog_schema_versions (schema_hash, last_seen_at);

CREATE TABLE IF NOT EXISTS catalog_schema_environment_state (
  schema_environment_state_id TEXT PRIMARY KEY,
  schema_track_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,

  current_schema_version_id TEXT NOT NULL,
  current_schema_hash TEXT NOT NULL,
  current_version_number INTEGER NOT NULL CHECK (current_version_number > 0),
  current_observed_at TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (schema_track_id, environment_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_schema_environment_endpoint
  ON catalog_schema_environment_state (organization_id, project_id, endpoint_id, environment_id);

CREATE TABLE IF NOT EXISTS catalog_schema_version_content_types (
  schema_version_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (schema_version_id, content_type)
);

ALTER TABLE catalog_ingestion_events ADD COLUMN schema_consolidation_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (schema_consolidation_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_ingestion_events ADD COLUMN schema_consolidation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_ingestion_events ADD COLUMN schema_consolidation_last_attempt_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN schema_consolidation_processed_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN schema_consolidation_error TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN request_schema_version_id TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN response_schema_version_id TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN request_schema_new_version INTEGER NOT NULL DEFAULT 0
  CHECK (request_schema_new_version IN (0, 1));
ALTER TABLE catalog_ingestion_events ADD COLUMN response_schema_new_version INTEGER NOT NULL DEFAULT 0
  CHECK (response_schema_new_version IN (0, 1));

-- Legacy events without any schema signal have nothing to consolidate. Mark them
-- complete in one bounded migration operation instead of draining them through
-- the scheduled processor one row at a time.
UPDATE catalog_ingestion_events
SET schema_consolidation_status = 'PROCESSED',
    schema_consolidation_processed_at = COALESCE(schema_consolidation_processed_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE request_schema_hash IS NULL
  AND response_schema_hash IS NULL
  AND schema_consolidation_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_pending_schema_consolidation
  ON catalog_ingestion_events (schema_consolidation_status, observed_at, received_at);
CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_schema_versions
  ON catalog_ingestion_events (organization_id, project_id, catalog_endpoint_id, request_schema_version_id, response_schema_version_id);

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.6', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_versioning_version', 'schema-versioning-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
