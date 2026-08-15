-- QAgent Foundation 07.5.7 — Evidence Model
-- The durable catalog_ingestion_events journal is promoted into the Evidence Ledger.
-- We do not duplicate every observation into a second evidence table. Instead, each
-- fully processed safe fact receives a deterministic evidence identity/fingerprint
-- and is exposed through storage-free views for endpoint/schema provenance.

ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_id TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_model_version TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_kind TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_outcome_class TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_fingerprint TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (evidence_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_last_attempt_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_ready_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN evidence_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_ingestion_evidence_id
  ON catalog_ingestion_events (evidence_id)
  WHERE evidence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_pending_evidence
  ON catalog_ingestion_events (evidence_status, observed_at, received_at);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_evidence_lookup
  ON catalog_ingestion_events (
    organization_id, project_id, catalog_endpoint_id, evidence_status, observed_at
  );

CREATE INDEX IF NOT EXISTS idx_catalog_service_evidence_lookup
  ON catalog_ingestion_events (
    organization_id, project_id, service_id, evidence_status, observed_at
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

DROP VIEW IF EXISTS catalog_schema_evidence_v1;
CREATE VIEW catalog_schema_evidence_v1 AS
SELECT
  evidence_id,
  event_id,
  organization_id,
  project_id,
  environment_id,
  service_id,
  service_host_id,
  catalog_endpoint_id,
  observation_session_id,
  normalized_event_id,
  batch_id,
  observed_at,
  status_code AS http_status_code,
  'REQUEST' AS direction,
  NULL AS schema_status_code,
  request_schema_hash AS schema_hash,
  request_schema_version_id AS schema_version_id,
  request_schema_new_version AS introduced_new_version,
  request_content_type AS content_type,
  evidence_outcome_class,
  evidence_fingerprint
FROM catalog_ingestion_events
WHERE evidence_status = 'PROCESSED'
  AND request_schema_hash IS NOT NULL
  AND request_schema_version_id IS NOT NULL
UNION ALL
SELECT
  evidence_id,
  event_id,
  organization_id,
  project_id,
  environment_id,
  service_id,
  service_host_id,
  catalog_endpoint_id,
  observation_session_id,
  normalized_event_id,
  batch_id,
  observed_at,
  status_code AS http_status_code,
  'RESPONSE' AS direction,
  status_code AS schema_status_code,
  response_schema_hash AS schema_hash,
  response_schema_version_id AS schema_version_id,
  response_schema_new_version AS introduced_new_version,
  response_content_type AS content_type,
  evidence_outcome_class,
  evidence_fingerprint
FROM catalog_ingestion_events
WHERE evidence_status = 'PROCESSED'
  AND response_schema_hash IS NOT NULL
  AND response_schema_version_id IS NOT NULL;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.7', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('evidence_model_version', 'evidence-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
