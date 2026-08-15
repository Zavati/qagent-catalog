-- QAgent Foundation 07.5.10 — Catalog Lifecycle
-- Durable endpoint lifecycle is separate from automatic discovery/confidence.
-- New evidence never silently overwrites a human lifecycle decision.

ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'DISCOVERED'
  CHECK (lifecycle_state IN ('DISCOVERED', 'CONFIRMED', 'IGNORED', 'DEPRECATED'));
ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_source TEXT NOT NULL DEFAULT 'AUTO'
  CHECK (lifecycle_source IN ('AUTO', 'USER', 'SYSTEM'));
ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_version TEXT NOT NULL DEFAULT 'catalog-lifecycle-v1';
ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_revision INTEGER NOT NULL DEFAULT 1
  CHECK (lifecycle_revision >= 1);
ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_actor_id TEXT;
ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_reason TEXT;
ALTER TABLE catalog_endpoints ADD COLUMN lifecycle_updated_at TEXT;

UPDATE catalog_endpoints
SET lifecycle_state = 'DISCOVERED',
    lifecycle_source = 'AUTO',
    lifecycle_version = 'catalog-lifecycle-v1',
    lifecycle_revision = 1,
    lifecycle_actor_id = NULL,
    lifecycle_reason = 'INITIAL_DISCOVERY_BACKFILL',
    lifecycle_updated_at = COALESCE(created_at, first_seen_at, CURRENT_TIMESTAMP)
WHERE lifecycle_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_endpoints_lifecycle
  ON catalog_endpoints (
    organization_id,
    project_id,
    lifecycle_state,
    discovery_confidence_score,
    last_seen_at
  );

CREATE TABLE IF NOT EXISTS catalog_endpoint_lifecycle_events (
  lifecycle_event_id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,

  lifecycle_revision INTEGER NOT NULL CHECK (lifecycle_revision >= 1),
  from_state TEXT CHECK (from_state IS NULL OR from_state IN ('DISCOVERED', 'CONFIRMED', 'IGNORED', 'DEPRECATED')),
  to_state TEXT NOT NULL CHECK (to_state IN ('DISCOVERED', 'CONFIRMED', 'IGNORED', 'DEPRECATED')),
  source TEXT NOT NULL CHECK (source IN ('AUTO', 'USER', 'SYSTEM')),
  actor_id TEXT,
  reason TEXT,

  changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,

  UNIQUE (endpoint_id, lifecycle_revision)
);

CREATE INDEX IF NOT EXISTS idx_catalog_lifecycle_events_endpoint
  ON catalog_endpoint_lifecycle_events (endpoint_id, lifecycle_revision DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_lifecycle_events_project
  ON catalog_endpoint_lifecycle_events (organization_id, project_id, changed_at DESC);

-- Every endpoint that existed before this migration receives an immutable initial
-- DISCOVERED audit record. Event ids are deterministic for this one-time backfill.
INSERT OR IGNORE INTO catalog_endpoint_lifecycle_events (
  lifecycle_event_id,
  endpoint_id,
  organization_id,
  project_id,
  service_id,
  lifecycle_revision,
  from_state,
  to_state,
  source,
  actor_id,
  reason,
  changed_at,
  created_at
)
SELECT
  'cle_migration_' || endpoint_id,
  endpoint_id,
  organization_id,
  project_id,
  service_id,
  1,
  NULL,
  'DISCOVERED',
  'AUTO',
  NULL,
  'INITIAL_DISCOVERY_BACKFILL',
  COALESCE(lifecycle_updated_at, created_at, first_seen_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM catalog_endpoints;

DROP VIEW IF EXISTS catalog_endpoint_lifecycle_v1;
CREATE VIEW catalog_endpoint_lifecycle_v1 AS
SELECT
  dc.endpoint_id,
  dc.organization_id,
  dc.project_id,
  dc.service_id,
  dc.service_name,
  dc.classification,
  dc.classification_confidence,
  dc.method,
  dc.normalized_path,
  dc.observation_count,
  dc.session_count,
  dc.environment_count,
  dc.discovery_confidence_score,
  dc.discovery_confidence_level,
  dc.last_seen_at,

  e.lifecycle_state,
  e.lifecycle_source,
  e.lifecycle_version,
  e.lifecycle_revision,
  e.lifecycle_actor_id,
  e.lifecycle_reason,
  e.lifecycle_updated_at,

  CASE WHEN e.lifecycle_source = 'USER' THEN 1 ELSE 0 END AS has_user_decision,
  CASE
    WHEN e.lifecycle_source <> 'AUTO'
     AND e.lifecycle_updated_at IS NOT NULL
     AND dc.last_seen_at IS NOT NULL
     AND dc.last_seen_at > e.lifecycle_updated_at
    THEN 1 ELSE 0
  END AS has_new_evidence_since_lifecycle_change
FROM catalog_endpoint_discovery_confidence_v1 dc
JOIN catalog_endpoints e ON e.endpoint_id = dc.endpoint_id;

DROP VIEW IF EXISTS catalog_endpoint_lifecycle_history_v1;
CREATE VIEW catalog_endpoint_lifecycle_history_v1 AS
SELECT
  le.lifecycle_event_id,
  le.endpoint_id,
  le.organization_id,
  le.project_id,
  le.service_id,
  svc.display_name AS service_name,
  e.method,
  e.normalized_path,
  le.lifecycle_revision,
  le.from_state,
  le.to_state,
  le.source,
  le.actor_id,
  le.reason,
  le.changed_at,
  le.created_at
FROM catalog_endpoint_lifecycle_events le
JOIN catalog_endpoints e ON e.endpoint_id = le.endpoint_id
JOIN catalog_services svc ON svc.service_id = le.service_id;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.10', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('catalog_lifecycle_version', 'catalog-lifecycle-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
