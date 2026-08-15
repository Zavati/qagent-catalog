-- QAgent Foundation 07.5.4 — Stable Logical Endpoint Identity
-- Logical endpoint identity is tenant/project/service + HTTP method + normalized path.
-- It deliberately excludes environment, scheme, host, session, batch and Normalizer endpoint ids.

CREATE TABLE IF NOT EXISTS catalog_endpoints (
  endpoint_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,

  method TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  endpoint_key TEXT NOT NULL,

  identity_strategy TEXT NOT NULL
    CHECK (identity_strategy IN ('SERVICE_METHOD_PATH')),
  identity_version TEXT NOT NULL
    CHECK (identity_version = 'logical-endpoint-v1'),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (organization_id, project_id, service_id, method, normalized_path)
);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoints_project_service
  ON catalog_endpoints (organization_id, project_id, service_id, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoints_lookup
  ON catalog_endpoints (organization_id, project_id, method, normalized_path);

CREATE TABLE IF NOT EXISTS catalog_endpoint_bindings (
  endpoint_binding_id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_host_id TEXT NOT NULL,

  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (endpoint_id, service_host_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_bindings_endpoint
  ON catalog_endpoint_bindings (endpoint_id, environment_id, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_bindings_environment
  ON catalog_endpoint_bindings (organization_id, project_id, environment_id, service_id);

ALTER TABLE catalog_ingestion_events ADD COLUMN catalog_endpoint_id TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN endpoint_identity_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (endpoint_identity_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_ingestion_events ADD COLUMN endpoint_identity_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_ingestion_events ADD COLUMN endpoint_identity_last_attempt_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN endpoint_identity_processed_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN endpoint_identity_error TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_endpoint
  ON catalog_ingestion_events (organization_id, project_id, catalog_endpoint_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_pending_endpoint_identity
  ON catalog_ingestion_events (endpoint_identity_status, received_at);

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.4', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('logical_endpoint_identity_version', 'logical-endpoint-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
