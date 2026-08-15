-- QAgent Foundation 07.5.8 — Frequency & Operational Signals
-- Incremental, idempotent endpoint-level operational aggregates derived from the
-- Evidence Ledger. This is not monitoring/alerting; it is durable catalog knowledge
-- about how frequently and how reliably a logical endpoint has been observed.

CREATE TABLE IF NOT EXISTS catalog_endpoint_operational_signals (
  endpoint_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  signal_version TEXT NOT NULL CHECK (signal_version = 'operational-signals-v1'),

  observation_count INTEGER NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
  environment_count INTEGER NOT NULL DEFAULT 0 CHECK (environment_count >= 0),

  informational_count INTEGER NOT NULL DEFAULT 0 CHECK (informational_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  redirect_count INTEGER NOT NULL DEFAULT 0 CHECK (redirect_count >= 0),
  client_error_count INTEGER NOT NULL DEFAULT 0 CHECK (client_error_count >= 0),
  server_error_count INTEGER NOT NULL DEFAULT 0 CHECK (server_error_count >= 0),
  network_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (network_failure_count >= 0),
  no_status_count INTEGER NOT NULL DEFAULT 0 CHECK (no_status_count >= 0),

  latency_observation_count INTEGER NOT NULL DEFAULT 0 CHECK (latency_observation_count >= 0),
  latency_total_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_total_ms >= 0),
  latency_min_ms INTEGER CHECK (latency_min_ms IS NULL OR latency_min_ms >= 0),
  latency_max_ms INTEGER CHECK (latency_max_ms IS NULL OR latency_max_ms >= 0),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_evidence_id TEXT NOT NULL,
  last_evidence_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_operational_project
  ON catalog_endpoint_operational_signals (
    organization_id, project_id, last_seen_at, observation_count
  );
CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_operational_service
  ON catalog_endpoint_operational_signals (
    organization_id, project_id, service_id, last_seen_at, observation_count
  );

CREATE TABLE IF NOT EXISTS catalog_endpoint_environment_operational_signals (
  endpoint_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  signal_version TEXT NOT NULL CHECK (signal_version = 'operational-signals-v1'),

  observation_count INTEGER NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),

  informational_count INTEGER NOT NULL DEFAULT 0 CHECK (informational_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  redirect_count INTEGER NOT NULL DEFAULT 0 CHECK (redirect_count >= 0),
  client_error_count INTEGER NOT NULL DEFAULT 0 CHECK (client_error_count >= 0),
  server_error_count INTEGER NOT NULL DEFAULT 0 CHECK (server_error_count >= 0),
  network_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (network_failure_count >= 0),
  no_status_count INTEGER NOT NULL DEFAULT 0 CHECK (no_status_count >= 0),

  latency_observation_count INTEGER NOT NULL DEFAULT 0 CHECK (latency_observation_count >= 0),
  latency_total_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_total_ms >= 0),
  latency_min_ms INTEGER CHECK (latency_min_ms IS NULL OR latency_min_ms >= 0),
  latency_max_ms INTEGER CHECK (latency_max_ms IS NULL OR latency_max_ms >= 0),

  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_evidence_id TEXT NOT NULL,
  last_evidence_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  PRIMARY KEY (endpoint_id, environment_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_environment_operational_project
  ON catalog_endpoint_environment_operational_signals (
    organization_id, project_id, environment_id, last_seen_at, observation_count
  );

-- Presence sets make distinct session/environment counts exact without keeping
-- unbounded sets in Worker memory. introduced_by_event_id allows an atomic batch
-- to know whether the current Evidence introduced a new distinct member.
CREATE TABLE IF NOT EXISTS catalog_endpoint_session_presence (
  endpoint_id TEXT NOT NULL,
  observation_session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  introduced_by_event_id TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (endpoint_id, observation_session_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_session_presence_project
  ON catalog_endpoint_session_presence (
    organization_id, project_id, endpoint_id, environment_id, last_seen_at
  );

CREATE TABLE IF NOT EXISTS catalog_endpoint_environment_presence (
  endpoint_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  introduced_by_event_id TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (endpoint_id, environment_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_endpoint_environment_presence_project
  ON catalog_endpoint_environment_presence (
    organization_id, project_id, environment_id, endpoint_id
  );

ALTER TABLE catalog_ingestion_events ADD COLUMN operational_signal_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (operational_signal_status IN ('PENDING', 'PROCESSED', 'FAILED'));
ALTER TABLE catalog_ingestion_events ADD COLUMN operational_signal_version TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN operational_signal_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_ingestion_events ADD COLUMN operational_signal_last_attempt_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN operational_signal_processed_at TEXT;
ALTER TABLE catalog_ingestion_events ADD COLUMN operational_signal_error TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_ingestion_pending_operational_signal
  ON catalog_ingestion_events (operational_signal_status, observed_at, received_at);

-- Read models for the future Query API / Console. Rates are derived rather than
-- persisted, so retry/reprocessing cannot create denominator drift.
DROP VIEW IF EXISTS catalog_endpoint_operational_summary_v1;
CREATE VIEW catalog_endpoint_operational_summary_v1 AS
SELECT
  s.endpoint_id,
  s.organization_id,
  s.project_id,
  s.service_id,
  svc.display_name AS service_name,
  svc.classification,
  svc.classification_confidence,
  e.method,
  e.normalized_path,
  s.signal_version,
  s.observation_count,
  s.session_count,
  s.environment_count,
  s.informational_count,
  s.success_count,
  s.redirect_count,
  s.client_error_count,
  s.server_error_count,
  s.network_failure_count,
  s.no_status_count,
  (s.client_error_count + s.server_error_count + s.network_failure_count) AS error_count,
  ROUND(CASE WHEN s.observation_count > 0
    THEN (100.0 * s.success_count) / s.observation_count ELSE 0 END, 2) AS success_rate_pct,
  ROUND(CASE WHEN s.observation_count > 0
    THEN (100.0 * s.client_error_count) / s.observation_count ELSE 0 END, 2) AS client_error_rate_pct,
  ROUND(CASE WHEN s.observation_count > 0
    THEN (100.0 * s.server_error_count) / s.observation_count ELSE 0 END, 2) AS server_error_rate_pct,
  ROUND(CASE WHEN s.observation_count > 0
    THEN (100.0 * s.network_failure_count) / s.observation_count ELSE 0 END, 2) AS network_failure_rate_pct,
  ROUND(CASE WHEN s.latency_observation_count > 0
    THEN (1.0 * s.latency_total_ms) / s.latency_observation_count ELSE NULL END, 2) AS latency_avg_ms,
  s.latency_min_ms,
  s.latency_max_ms,
  ROUND(CASE WHEN s.session_count > 0
    THEN (1.0 * s.observation_count) / s.session_count ELSE NULL END, 2) AS observations_per_session,
  s.first_seen_at,
  s.last_seen_at,
  s.first_evidence_id,
  s.last_evidence_id,
  s.updated_at
FROM catalog_endpoint_operational_signals s
JOIN catalog_endpoints e ON e.endpoint_id = s.endpoint_id
JOIN catalog_services svc ON svc.service_id = s.service_id;

DROP VIEW IF EXISTS catalog_endpoint_environment_operational_summary_v1;
CREATE VIEW catalog_endpoint_environment_operational_summary_v1 AS
SELECT
  s.endpoint_id,
  s.environment_id,
  s.organization_id,
  s.project_id,
  s.service_id,
  svc.display_name AS service_name,
  svc.classification,
  e.method,
  e.normalized_path,
  s.signal_version,
  s.observation_count,
  s.session_count,
  s.informational_count,
  s.success_count,
  s.redirect_count,
  s.client_error_count,
  s.server_error_count,
  s.network_failure_count,
  s.no_status_count,
  (s.client_error_count + s.server_error_count + s.network_failure_count) AS error_count,
  ROUND(CASE WHEN s.observation_count > 0
    THEN (100.0 * s.success_count) / s.observation_count ELSE 0 END, 2) AS success_rate_pct,
  ROUND(CASE WHEN s.latency_observation_count > 0
    THEN (1.0 * s.latency_total_ms) / s.latency_observation_count ELSE NULL END, 2) AS latency_avg_ms,
  s.latency_min_ms,
  s.latency_max_ms,
  ROUND(CASE WHEN s.session_count > 0
    THEN (1.0 * s.observation_count) / s.session_count ELSE NULL END, 2) AS observations_per_session,
  s.first_seen_at,
  s.last_seen_at,
  s.first_evidence_id,
  s.last_evidence_id,
  s.updated_at
FROM catalog_endpoint_environment_operational_signals s
JOIN catalog_endpoints e ON e.endpoint_id = s.endpoint_id
JOIN catalog_services svc ON svc.service_id = s.service_id;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('schema_foundation', '07.5.8', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;

INSERT INTO catalog_metadata (meta_key, meta_value, updated_at)
VALUES ('operational_signal_version', 'operational-signals-v1', CURRENT_TIMESTAMP)
ON CONFLICT(meta_key) DO UPDATE SET
  meta_value = excluded.meta_value,
  updated_at = excluded.updated_at;
