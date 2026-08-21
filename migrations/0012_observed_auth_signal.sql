-- QAgent Foundation 07.7.2-A FIX-2 — Observed Auth Signal Bridge
-- Persist only authentication presence/type derived upstream. Credential values remain forbidden.

ALTER TABLE catalog_ingestion_events
  ADD COLUMN auth_observed INTEGER
    CHECK (auth_observed IS NULL OR auth_observed IN (0, 1));

ALTER TABLE catalog_ingestion_events
  ADD COLUMN auth_scheme TEXT
    CHECK (
      auth_scheme IS NULL
      OR auth_scheme IN ('BEARER', 'BASIC', 'API_KEY', 'COOKIE', 'UNKNOWN')
    );

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_auth_signal
  ON catalog_ingestion_events (
    organization_id, project_id, catalog_endpoint_id, auth_observed, auth_scheme, observed_at
  );

DROP VIEW IF EXISTS catalog_evidence_v1;
CREATE VIEW catalog_evidence_v1 AS
SELECT
  evidence_id,
  evidence_fingerprint,
  evidence_model_version,
  evidence_kind,
  evidence_outcome_class,
  event_id,
  schema_version,
  organization_id,
  project_id,
  environment_id,
  normalized_event_id,
  normalized_endpoint_id,
  observation_session_id,
  batch_id,
  service_id,
  service_host_id,
  catalog_endpoint_id,
  method,
  scheme,
  host,
  normalized_path,
  observed_at,
  status_code,
  network_failure,
  origin_relation,
  latency_ms,
  resource_type,
  auth_observed,
  auth_scheme,
  request_content_type,
  response_content_type,
  request_schema_hash,
  request_schema_version_id,
  request_schema_new_version,
  response_schema_hash,
  response_schema_version_id,
  response_schema_new_version,
  emitted_at,
  received_at,
  evidence_ready_at
FROM catalog_ingestion_events
WHERE evidence_status = 'PROCESSED'
  AND evidence_id IS NOT NULL;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('auth_signal_foundation', '07.7.2-A-FIX-2', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
