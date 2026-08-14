-- QAgent Foundation 07.5.3 — Service Identity & Host Mapping
-- Service identity is logical and tenant/project-scoped.
-- Physical host/environment bindings remain separate evidence.

CREATE TABLE IF NOT EXISTS catalog_services (
  service_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,

  service_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  identity_strategy TEXT NOT NULL CHECK (identity_strategy IN ('HOST_EXACT')),
  identity_version TEXT NOT NULL CHECK (identity_version = 'service-identity-v1'),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (organization_id, project_id, service_key)
);

CREATE INDEX IF NOT EXISTS idx_catalog_services_project
  ON catalog_services (organization_id, project_id, last_seen_at);

CREATE TABLE IF NOT EXISTS catalog_service_hosts (
  service_host_id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,

  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,

  scheme TEXT NOT NULL,
  host TEXT NOT NULL,
  hostname TEXT NOT NULL,
  port TEXT,

  host_role TEXT NOT NULL DEFAULT 'OBSERVED'
    CHECK (host_role IN ('OBSERVED', 'ALIAS', 'CUSTOM_DOMAIN', 'GATEWAY')),
  mapping_source TEXT NOT NULL DEFAULT 'DETERMINISTIC'
    CHECK (mapping_source IN ('DETERMINISTIC', 'USER', 'SYSTEM')),
  mapping_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (mapping_status IN ('ACTIVE', 'INACTIVE')),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (organization_id, project_id, environment_id, scheme, host)
);

CREATE INDEX IF NOT EXISTS idx_catalog_service_hosts_service
  ON catalog_service_hosts (service_id, environment_id, mapping_status);

CREATE INDEX IF NOT EXISTS idx_catalog_service_hosts_lookup
  ON catalog_service_hosts (organization_id, project_id, hostname, environment_id);

ALTER TABLE catalog_ingestion_events ADD COLUMN service_id TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN service_host_id TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_ingestion_events ADD COLUMN last_processing_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_service
  ON catalog_ingestion_events (organization_id, project_id, service_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_pending_processing
  ON catalog_ingestion_events (processing_status, received_at);

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.3', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('service_identity_version', 'service-identity-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
