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
