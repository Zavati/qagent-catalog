-- QAgent Foundation 07.5.5 — Classification Engine
-- Classification is materialized at Service level and remains explainable.
-- classification_confidence is confidence in the category, NOT Discovery Confidence.
-- Per-event classification signals are accumulated once and then reused, avoiding
-- full-history rescans whenever a Service receives new observations.

ALTER TABLE catalog_services ADD COLUMN classification TEXT NOT NULL DEFAULT 'UNKNOWN'
  CHECK (classification IN (
    'FIRST_PARTY_API',
    'INTEGRATION',
    'THIRD_PARTY',
    'ANALYTICS',
    'OBSERVABILITY',
    'STATIC_ASSET',
    'UNKNOWN'
  ));
ALTER TABLE catalog_services ADD COLUMN classification_confidence INTEGER NOT NULL DEFAULT 0
  CHECK (classification_confidence >= 0 AND classification_confidence <= 100);
ALTER TABLE catalog_services ADD COLUMN classification_source TEXT NOT NULL DEFAULT 'HEURISTIC'
  CHECK (classification_source IN ('DETERMINISTIC', 'HEURISTIC', 'USER_CONFIRMED', 'AI_SUGGESTED'));
ALTER TABLE catalog_services ADD COLUMN classification_engine_version TEXT;
ALTER TABLE catalog_services ADD COLUMN classification_reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE catalog_services ADD COLUMN classification_signals_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE catalog_services ADD COLUMN classification_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (classification_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_services ADD COLUMN classification_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_services ADD COLUMN classification_last_attempt_at TEXT;
ALTER TABLE catalog_services ADD COLUMN classified_at TEXT;
ALTER TABLE catalog_services ADD COLUMN classification_error TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_services_classification
  ON catalog_services (organization_id, project_id, classification, classification_confidence, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_catalog_services_pending_classification
  ON catalog_services (classification_status, last_seen_at);

CREATE TABLE IF NOT EXISTS catalog_service_classification_signals (
  service_id TEXT PRIMARY KEY,
  observation_count INTEGER NOT NULL DEFAULT 0,
  same_origin_count INTEGER NOT NULL DEFAULT 0,
  same_site_count INTEGER NOT NULL DEFAULT 0,
  external_count INTEGER NOT NULL DEFAULT 0,
  unknown_origin_count INTEGER NOT NULL DEFAULT 0,
  api_transport_count INTEGER NOT NULL DEFAULT 0,
  static_resource_count INTEGER NOT NULL DEFAULT 0,
  schema_signal_count INTEGER NOT NULL DEFAULT 0,
  json_content_type_count INTEGER NOT NULL DEFAULT 0,
  api_path_count INTEGER NOT NULL DEFAULT 0,
  no_content_count INTEGER NOT NULL DEFAULT 0,
  known_analytics_count INTEGER NOT NULL DEFAULT 0,
  known_observability_count INTEGER NOT NULL DEFAULT 0,
  tracking_pattern_count INTEGER NOT NULL DEFAULT 0,
  analytics_signature_code TEXT,
  observability_signature_code TEXT,
  first_signal_at TEXT NOT NULL,
  last_signal_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE catalog_ingestion_events ADD COLUMN classification_signal_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (classification_signal_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_ingestion_events ADD COLUMN classification_signal_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_ingestion_events ADD COLUMN classification_signal_last_attempt_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN classification_signal_processed_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN classification_signal_error TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_pending_classification_signal
  ON catalog_ingestion_events (classification_signal_status, received_at);

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.5', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('classification_engine_version', 'classification-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
