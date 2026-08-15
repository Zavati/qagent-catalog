-- QAgent Foundation 07.5.9 — Discovery Confidence
-- Deterministic, explainable endpoint-level confidence derived from durable Catalog
-- knowledge. This is intentionally distinct from Service classification confidence.
-- The score estimates how strongly the Catalog can treat a logical endpoint as a
-- real, stable and QA-relevant discovery; it does not represent test pass/fail risk.

ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_score INTEGER
  CHECK (discovery_confidence_score IS NULL OR discovery_confidence_score BETWEEN 0 AND 100);
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_level TEXT
  CHECK (discovery_confidence_level IS NULL OR discovery_confidence_level IN ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_version TEXT;
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_signals_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (discovery_confidence_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_last_attempt_at TEXT;
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_calculated_at TEXT;
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_input_updated_at TEXT;
ALTER TABLE catalog_endpoints ADD COLUMN discovery_confidence_error TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_endpoints_discovery_confidence
  ON catalog_endpoints (
    organization_id,
    project_id,
    discovery_confidence_level,
    discovery_confidence_score,
    last_seen_at
  );

CREATE INDEX IF NOT EXISTS idx_catalog_endpoints_pending_discovery_confidence
  ON catalog_endpoints (discovery_confidence_status, discovery_confidence_calculated_at, last_seen_at);

-- Read model prepared for Foundation 07.5.11 Query API / Console. Schema statistics
-- are aggregated once in the view rather than exposing storage tables directly.
DROP VIEW IF EXISTS catalog_endpoint_discovery_confidence_v1;
CREATE VIEW catalog_endpoint_discovery_confidence_v1 AS
SELECT
  e.endpoint_id,
  e.organization_id,
  e.project_id,
  e.service_id,
  svc.display_name AS service_name,
  svc.classification,
  svc.classification_confidence,
  svc.classification_source,

  e.method,
  e.normalized_path,

  op.observation_count,
  op.session_count,
  op.environment_count,
  op.success_count,
  op.client_error_count,
  op.server_error_count,
  op.network_failure_count,
  ROUND(CASE WHEN op.observation_count > 0
    THEN (100.0 * op.success_count) / op.observation_count ELSE 0 END, 2) AS success_rate_pct,
  ROUND(CASE WHEN op.latency_observation_count > 0
    THEN (1.0 * op.latency_total_ms) / op.latency_observation_count ELSE NULL END, 2) AS latency_avg_ms,
  op.first_seen_at,
  op.last_seen_at,

  COALESCE(schema_stats.schema_track_count, 0) AS schema_track_count,
  COALESCE(schema_stats.stable_schema_track_count, 0) AS stable_schema_track_count,
  COALESCE(schema_stats.schema_version_count, 0) AS schema_version_count,
  COALESCE(schema_stats.max_schema_versions_per_track, 0) AS max_schema_versions_per_track,

  e.discovery_confidence_score,
  e.discovery_confidence_level,
  e.discovery_confidence_version,
  e.discovery_confidence_reasons_json,
  e.discovery_confidence_signals_json,
  e.discovery_confidence_status,
  e.discovery_confidence_calculated_at,
  e.discovery_confidence_input_updated_at,
  e.discovery_confidence_error

FROM catalog_endpoints e
JOIN catalog_services svc ON svc.service_id = e.service_id
LEFT JOIN catalog_endpoint_operational_signals op ON op.endpoint_id = e.endpoint_id
LEFT JOIN (
  SELECT
    endpoint_id,
    COUNT(*) AS schema_track_count,
    SUM(CASE WHEN distinct_version_count = 1 THEN 1 ELSE 0 END) AS stable_schema_track_count,
    SUM(distinct_version_count) AS schema_version_count,
    MAX(distinct_version_count) AS max_schema_versions_per_track
  FROM catalog_endpoint_schema_tracks
  GROUP BY endpoint_id
) schema_stats ON schema_stats.endpoint_id = e.endpoint_id;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.9', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('discovery_confidence_version', 'discovery-confidence-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
