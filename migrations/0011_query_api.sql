-- QAgent Foundation 07.5.11 — Query API
-- Read-optimized, tenant-scoped views for the Catalog HTTP contract.
-- The Console never reads D1 directly; these views are internal read models only.

CREATE INDEX IF NOT EXISTS idx_catalog_services_query_classification
  ON catalog_services (organization_id, project_id, classification, last_seen_at, service_id);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_bindings_query_environment
  ON catalog_endpoint_bindings (organization_id, project_id, environment_id, endpoint_id, service_id);

CREATE INDEX IF NOT EXISTS idx_catalog_evidence_query_endpoint_time
  ON catalog_ingestion_events (
    organization_id, project_id, catalog_endpoint_id, evidence_status, observed_at DESC, evidence_id
  );

CREATE INDEX IF NOT EXISTS idx_catalog_lifecycle_history_query
  ON catalog_endpoint_lifecycle_events (
    organization_id, project_id, endpoint_id, changed_at DESC, lifecycle_event_id
  );

DROP VIEW IF EXISTS catalog_query_services_v1;
CREATE VIEW catalog_query_services_v1 AS
WITH endpoint_rollup AS (
  SELECT
    e.organization_id,
    e.project_id,
    e.service_id,
    COUNT(*) AS endpoint_count,
    SUM(CASE WHEN e.lifecycle_state = 'DISCOVERED' THEN 1 ELSE 0 END) AS discovered_endpoint_count,
    SUM(CASE WHEN e.lifecycle_state = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_endpoint_count,
    SUM(CASE WHEN e.lifecycle_state = 'IGNORED' THEN 1 ELSE 0 END) AS ignored_endpoint_count,
    SUM(CASE WHEN e.lifecycle_state = 'DEPRECATED' THEN 1 ELSE 0 END) AS deprecated_endpoint_count,
    SUM(CASE WHEN e.discovery_confidence_level = 'HIGH' THEN 1 ELSE 0 END) AS high_confidence_endpoint_count,
    SUM(CASE WHEN e.discovery_confidence_level = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_confidence_endpoint_count,
    SUM(CASE WHEN e.discovery_confidence_level = 'LOW' THEN 1 ELSE 0 END) AS low_confidence_endpoint_count,
    SUM(CASE WHEN e.discovery_confidence_level = 'VERY_LOW' THEN 1 ELSE 0 END) AS very_low_confidence_endpoint_count,
    COALESCE(SUM(op.observation_count), 0) AS total_observation_count,
    COALESCE(SUM(op.success_count), 0) AS total_success_count,
    COALESCE(SUM(op.client_error_count), 0) AS total_client_error_count,
    COALESCE(SUM(op.server_error_count), 0) AS total_server_error_count,
    COALESCE(SUM(op.network_failure_count), 0) AS total_network_failure_count
  FROM catalog_endpoints e
  LEFT JOIN catalog_endpoint_operational_signals op ON op.endpoint_id = e.endpoint_id
  GROUP BY e.organization_id, e.project_id, e.service_id
),
host_rollup AS (
  SELECT
    organization_id,
    project_id,
    service_id,
    COUNT(DISTINCT environment_id) AS environment_count,
    COUNT(*) AS host_binding_count
  FROM catalog_service_hosts
  WHERE mapping_status = 'ACTIVE'
  GROUP BY organization_id, project_id, service_id
)
SELECT
  svc.service_id,
  svc.organization_id,
  svc.project_id,
  svc.service_key,
  svc.display_name,
  svc.identity_strategy,
  svc.identity_version,
  svc.classification,
  svc.classification_confidence,
  svc.classification_source,
  svc.classification_engine_version,
  svc.classification_reasons_json,
  svc.first_seen_at,
  svc.last_seen_at,
  COALESCE(er.endpoint_count, 0) AS endpoint_count,
  COALESCE(er.discovered_endpoint_count, 0) AS discovered_endpoint_count,
  COALESCE(er.confirmed_endpoint_count, 0) AS confirmed_endpoint_count,
  COALESCE(er.ignored_endpoint_count, 0) AS ignored_endpoint_count,
  COALESCE(er.deprecated_endpoint_count, 0) AS deprecated_endpoint_count,
  COALESCE(er.high_confidence_endpoint_count, 0) AS high_confidence_endpoint_count,
  COALESCE(er.medium_confidence_endpoint_count, 0) AS medium_confidence_endpoint_count,
  COALESCE(er.low_confidence_endpoint_count, 0) AS low_confidence_endpoint_count,
  COALESCE(er.very_low_confidence_endpoint_count, 0) AS very_low_confidence_endpoint_count,
  COALESCE(er.total_observation_count, 0) AS total_observation_count,
  COALESCE(er.total_success_count, 0) AS total_success_count,
  COALESCE(er.total_client_error_count, 0) AS total_client_error_count,
  COALESCE(er.total_server_error_count, 0) AS total_server_error_count,
  COALESCE(er.total_network_failure_count, 0) AS total_network_failure_count,
  COALESCE(hr.environment_count, 0) AS environment_count,
  COALESCE(hr.host_binding_count, 0) AS host_binding_count
FROM catalog_services svc
LEFT JOIN endpoint_rollup er
  ON er.organization_id = svc.organization_id
 AND er.project_id = svc.project_id
 AND er.service_id = svc.service_id
LEFT JOIN host_rollup hr
  ON hr.organization_id = svc.organization_id
 AND hr.project_id = svc.project_id
 AND hr.service_id = svc.service_id;

DROP VIEW IF EXISTS catalog_query_endpoints_v1;
CREATE VIEW catalog_query_endpoints_v1 AS
SELECT
  e.endpoint_id,
  e.organization_id,
  e.project_id,
  e.service_id,
  svc.display_name AS service_name,
  svc.service_key,
  svc.classification,
  svc.classification_confidence,
  svc.classification_source,

  e.method,
  e.normalized_path,
  e.endpoint_key,
  e.identity_strategy,
  e.identity_version,

  COALESCE(op.observation_count, 0) AS observation_count,
  COALESCE(op.session_count, 0) AS session_count,
  COALESCE(op.environment_count, 0) AS environment_count,
  COALESCE(op.informational_count, 0) AS informational_count,
  COALESCE(op.success_count, 0) AS success_count,
  COALESCE(op.redirect_count, 0) AS redirect_count,
  COALESCE(op.client_error_count, 0) AS client_error_count,
  COALESCE(op.server_error_count, 0) AS server_error_count,
  COALESCE(op.network_failure_count, 0) AS network_failure_count,
  COALESCE(op.no_status_count, 0) AS no_status_count,
  ROUND(CASE WHEN COALESCE(op.observation_count, 0) > 0
    THEN (100.0 * op.success_count) / op.observation_count ELSE 0 END, 2) AS success_rate_pct,
  ROUND(CASE WHEN COALESCE(op.latency_observation_count, 0) > 0
    THEN (1.0 * op.latency_total_ms) / op.latency_observation_count ELSE NULL END, 2) AS latency_avg_ms,
  op.latency_min_ms,
  op.latency_max_ms,

  COALESCE(schema_stats.schema_track_count, 0) AS schema_track_count,
  COALESCE(schema_stats.stable_schema_track_count, 0) AS stable_schema_track_count,
  COALESCE(schema_stats.schema_version_count, 0) AS schema_version_count,

  e.discovery_confidence_score,
  e.discovery_confidence_level,
  e.discovery_confidence_version,
  e.discovery_confidence_reasons_json,
  e.discovery_confidence_signals_json,
  e.discovery_confidence_status,
  e.discovery_confidence_calculated_at,

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
     AND COALESCE(op.last_seen_at, e.last_seen_at) > e.lifecycle_updated_at
    THEN 1 ELSE 0
  END AS has_new_evidence_since_lifecycle_change,

  COALESCE(op.first_seen_at, e.first_seen_at) AS first_seen_at,
  COALESCE(op.last_seen_at, e.last_seen_at) AS last_seen_at,
  e.created_at,
  e.updated_at

FROM catalog_endpoints e
JOIN catalog_services svc ON svc.service_id = e.service_id
LEFT JOIN catalog_endpoint_operational_signals op ON op.endpoint_id = e.endpoint_id
LEFT JOIN (
  SELECT
    endpoint_id,
    COUNT(*) AS schema_track_count,
    SUM(CASE WHEN distinct_version_count = 1 THEN 1 ELSE 0 END) AS stable_schema_track_count,
    SUM(distinct_version_count) AS schema_version_count
  FROM catalog_endpoint_schema_tracks
  GROUP BY endpoint_id
) schema_stats ON schema_stats.endpoint_id = e.endpoint_id;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.11', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('query_api_version', 'catalog-query-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
