-- QAgent Catalog — Foundation 07.5 validation/reference queries
-- Engineering/operations only. The future Console contract is the Query API.

-- ================================================================
-- 07.5.2 — Ingestion Contract
-- ================================================================
SELECT processing_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY processing_status;

SELECT normalized_event_id, COUNT(*) AS rows_per_event
FROM catalog_ingestion_events
GROUP BY normalized_event_id
HAVING COUNT(*) > 1;

-- ================================================================
-- 07.5.3 — Service Identity & Host Mapping
-- ================================================================
SELECT
  service_id, service_key, display_name,
  identity_strategy, identity_version,
  first_seen_at, last_seen_at
FROM catalog_services
ORDER BY last_seen_at DESC;

SELECT
  service_host_id, service_id, environment_id,
  scheme, host, hostname, port,
  host_role, mapping_source, mapping_status,
  first_seen_at, last_seen_at
FROM catalog_service_hosts
ORDER BY last_seen_at DESC;

-- ================================================================
-- 07.5.4 — Stable Logical Endpoint Identity
-- ================================================================
SELECT
  endpoint_id, service_id, method, normalized_path,
  endpoint_key, identity_strategy, identity_version,
  first_seen_at, last_seen_at
FROM catalog_endpoints
ORDER BY service_id, method, normalized_path;

SELECT
  organization_id, project_id, service_id, method, normalized_path,
  COUNT(*) AS total
FROM catalog_endpoints
GROUP BY organization_id, project_id, service_id, method, normalized_path
HAVING COUNT(*) > 1;

-- ================================================================
-- 07.5.5 — Classification Engine
-- ================================================================
SELECT classification, COUNT(*) AS services
FROM catalog_services
GROUP BY classification
ORDER BY services DESC, classification;

SELECT
  display_name,
  classification,
  classification_confidence,
  classification_source,
  classification_engine_version,
  classification_reasons_json
FROM catalog_services
ORDER BY classification, display_name;

SELECT
  (SELECT COUNT(*) FROM catalog_ingestion_events
    WHERE classification_signal_status = 'PROCESSED') AS processed_event_signals,
  (SELECT COALESCE(SUM(observation_count), 0)
    FROM catalog_service_classification_signals) AS aggregated_observations;

-- ================================================================
-- 07.5.6 — Schema Consolidation & Versioning
-- ================================================================
SELECT schema_consolidation_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY schema_consolidation_status;

SELECT
  e.method,
  e.normalized_path,
  s.display_name AS service,
  t.direction,
  t.status_code,
  v.version_number,
  v.schema_hash,
  v.observation_count,
  v.schema_json
FROM catalog_schema_versions v
JOIN catalog_endpoint_schema_tracks t ON t.schema_track_id = v.schema_track_id
JOIN catalog_endpoints e ON e.endpoint_id = v.endpoint_id
JOIN catalog_services s ON s.service_id = e.service_id
ORDER BY s.display_name, e.method, e.normalized_path,
         t.direction, t.status_code, v.version_number;

SELECT
  e.method,
  e.normalized_path,
  st.direction,
  st.status_code,
  es.environment_id,
  es.current_version_number,
  es.current_schema_hash,
  es.current_observed_at
FROM catalog_schema_environment_state es
JOIN catalog_endpoint_schema_tracks st ON st.schema_track_id = es.schema_track_id
JOIN catalog_endpoints e ON e.endpoint_id = es.endpoint_id
ORDER BY e.method, e.normalized_path, st.direction,
         st.status_code, es.environment_id;

-- ================================================================
-- 07.5.7 — Evidence Model
-- ================================================================
SELECT evidence_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY evidence_status;

SELECT
  COUNT(*) AS eligible_events,
  SUM(CASE WHEN evidence_status = 'PROCESSED' THEN 1 ELSE 0 END) AS evidence_ready
FROM catalog_ingestion_events
WHERE processing_status = 'PROCESSED'
  AND endpoint_identity_status = 'PROCESSED'
  AND schema_consolidation_status = 'PROCESSED';

SELECT evidence_id, COUNT(*) AS total
FROM catalog_ingestion_events
WHERE evidence_id IS NOT NULL
GROUP BY evidence_id
HAVING COUNT(*) > 1;

SELECT evidence_outcome_class, COUNT(*) AS total
FROM catalog_evidence_v1
GROUP BY evidence_outcome_class
ORDER BY total DESC;

SELECT
  evidence_id,
  service_id,
  catalog_endpoint_id,
  environment_id,
  method,
  host,
  normalized_path,
  status_code,
  evidence_outcome_class,
  latency_ms,
  origin_relation,
  observation_session_id,
  normalized_event_id,
  observed_at
FROM catalog_evidence_v1
ORDER BY observed_at DESC
LIMIT 100;

SELECT
  evidence_id,
  catalog_endpoint_id,
  environment_id,
  direction,
  schema_status_code,
  schema_hash,
  schema_version_id,
  introduced_new_version,
  content_type,
  observed_at,
  normalized_event_id
FROM catalog_schema_evidence_v1
ORDER BY observed_at DESC
LIMIT 100;

-- ================================================================
-- 07.5.8 — Frequency & Operational Signals
-- ================================================================
SELECT operational_signal_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY operational_signal_status;

SELECT
  (SELECT COUNT(*)
     FROM catalog_ingestion_events
    WHERE evidence_status = 'PROCESSED'
      AND operational_signal_status = 'PROCESSED') AS processed_evidence,
  (SELECT COALESCE(SUM(observation_count), 0)
     FROM catalog_endpoint_operational_signals) AS aggregated_observations;

SELECT
  service_name,
  classification,
  method,
  normalized_path,
  observation_count,
  session_count,
  environment_count,
  success_count,
  client_error_count,
  server_error_count,
  network_failure_count,
  success_rate_pct,
  latency_avg_ms,
  latency_min_ms,
  latency_max_ms,
  observations_per_session,
  first_seen_at,
  last_seen_at
FROM catalog_endpoint_operational_summary_v1
ORDER BY observation_count DESC, last_seen_at DESC
LIMIT 100;

SELECT
  service_name,
  method,
  normalized_path,
  environment_id,
  observation_count,
  session_count,
  success_rate_pct,
  latency_avg_ms,
  latency_min_ms,
  latency_max_ms,
  first_seen_at,
  last_seen_at
FROM catalog_endpoint_environment_operational_summary_v1
ORDER BY method, normalized_path, environment_id;

-- ============================================================================
-- Foundation 07.5.9 — Discovery Confidence
-- ============================================================================

-- Processing status.
SELECT
    discovery_confidence_status,
    COUNT(*) AS endpoints
FROM catalog_endpoints
GROUP BY discovery_confidence_status;

-- Level distribution.
SELECT
    discovery_confidence_level,
    COUNT(*) AS endpoints,
    ROUND(AVG(discovery_confidence_score), 2) AS avg_score,
    MIN(discovery_confidence_score) AS min_score,
    MAX(discovery_confidence_score) AS max_score
FROM catalog_endpoints
WHERE discovery_confidence_status = 'PROCESSED'
GROUP BY discovery_confidence_level
ORDER BY avg_score DESC;

-- Explainable ranked endpoint knowledge.
SELECT
    service_name,
    classification,
    classification_confidence,
    method,
    normalized_path,
    observation_count,
    session_count,
    environment_count,
    schema_track_count,
    stable_schema_track_count,
    discovery_confidence_score,
    discovery_confidence_level,
    discovery_confidence_reasons_json,
    discovery_confidence_signals_json,
    discovery_confidence_calculated_at
FROM catalog_endpoint_discovery_confidence_v1
WHERE discovery_confidence_status = 'PROCESSED'
ORDER BY discovery_confidence_score DESC, observation_count DESC, last_seen_at DESC
LIMIT 100;

-- Functional discovery candidates.
SELECT
    service_name,
    classification,
    method,
    normalized_path,
    observation_count,
    session_count,
    schema_track_count,
    discovery_confidence_score,
    discovery_confidence_level
FROM catalog_endpoint_discovery_confidence_v1
WHERE discovery_confidence_status = 'PROCESSED'
  AND classification IN ('FIRST_PARTY_API', 'INTEGRATION', 'UNKNOWN')
ORDER BY discovery_confidence_score DESC, observation_count DESC
LIMIT 100;

-- Noise-control validation.
SELECT
    classification,
    discovery_confidence_level,
    COUNT(*) AS endpoints,
    ROUND(AVG(discovery_confidence_score), 2) AS avg_score
FROM catalog_endpoint_discovery_confidence_v1
WHERE discovery_confidence_status = 'PROCESSED'
  AND classification IN ('ANALYTICS', 'OBSERVABILITY', 'STATIC_ASSET')
GROUP BY classification, discovery_confidence_level
ORDER BY classification, avg_score DESC;

-- Failures should remain empty.
SELECT
    endpoint_id,
    method,
    normalized_path,
    discovery_confidence_attempts,
    discovery_confidence_last_attempt_at,
    discovery_confidence_error
FROM catalog_endpoints
WHERE discovery_confidence_status = 'FAILED'
ORDER BY discovery_confidence_last_attempt_at DESC;

-- ============================================================================
-- Foundation 07.5.10 — Catalog Lifecycle
-- ============================================================================

-- Current lifecycle distribution.
SELECT
    lifecycle_state,
    lifecycle_source,
    COUNT(*) AS endpoints
FROM catalog_endpoints
GROUP BY lifecycle_state, lifecycle_source
ORDER BY lifecycle_state, lifecycle_source;

-- Every endpoint must have lifecycle history.
SELECT
    (SELECT COUNT(*) FROM catalog_endpoints) AS endpoints,
    (SELECT COUNT(DISTINCT endpoint_id) FROM catalog_endpoint_lifecycle_events) AS endpoints_with_history;

-- Current revision must match the latest immutable history revision.
SELECT
    e.endpoint_id,
    e.lifecycle_revision,
    MAX(h.lifecycle_revision) AS history_revision
FROM catalog_endpoints e
LEFT JOIN catalog_endpoint_lifecycle_events h ON h.endpoint_id = e.endpoint_id
GROUP BY e.endpoint_id, e.lifecycle_revision
HAVING e.lifecycle_revision <> COALESCE(MAX(h.lifecycle_revision), 0);

-- Product-oriented lifecycle read model.
SELECT
    service_name,
    classification,
    method,
    normalized_path,
    discovery_confidence_score,
    discovery_confidence_level,
    lifecycle_state,
    lifecycle_source,
    lifecycle_revision,
    has_user_decision,
    has_new_evidence_since_lifecycle_change,
    last_seen_at,
    lifecycle_updated_at
FROM catalog_endpoint_lifecycle_v1
ORDER BY discovery_confidence_score DESC, last_seen_at DESC
LIMIT 100;

-- Immutable lifecycle history.
SELECT
    lifecycle_event_id,
    service_name,
    method,
    normalized_path,
    lifecycle_revision,
    from_state,
    to_state,
    source,
    actor_id,
    reason,
    changed_at
FROM catalog_endpoint_lifecycle_history_v1
ORDER BY changed_at DESC
LIMIT 100;
