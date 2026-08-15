import type { EvidenceOutcomeClass } from "../evidence/evidenceModel";
import {
  OPERATIONAL_SIGNAL_VERSION,
  deriveOperationalContribution,
} from "../operational/operationalSignals";

export interface PendingOperationalSignalEvent {
  eventId: string;
  evidenceId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  catalogEndpointId: string;
  observationSessionId: string;
  observedAt: string;
  evidenceOutcomeClass: EvidenceOutcomeClass;
  latencyMs: number;
}

interface PendingOperationalRow {
  event_id: string;
  evidence_id: string;
  organization_id: string;
  project_id: string;
  environment_id: string;
  service_id: string;
  catalog_endpoint_id: string;
  observation_session_id: string;
  observed_at: string;
  evidence_outcome_class: EvidenceOutcomeClass;
  latency_ms: number;
}

function fromRow(row: PendingOperationalRow): PendingOperationalSignalEvent {
  return {
    eventId: row.event_id,
    evidenceId: row.evidence_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    serviceId: row.service_id,
    catalogEndpointId: row.catalog_endpoint_id,
    observationSessionId: row.observation_session_id,
    observedAt: row.observed_at,
    evidenceOutcomeClass: row.evidence_outcome_class,
    latencyMs: row.latency_ms,
  };
}

const OPERATIONAL_READY_PREDICATE = `
  evidence_status = 'PROCESSED'
  AND evidence_id IS NOT NULL
  AND service_id IS NOT NULL
  AND catalog_endpoint_id IS NOT NULL
  AND evidence_outcome_class IS NOT NULL
`;

export async function loadPendingOperationalSignalEvent(
  db: D1Database,
  eventId: string,
): Promise<PendingOperationalSignalEvent | null> {
  const row = await db.prepare(`
    SELECT
      event_id, evidence_id,
      organization_id, project_id, environment_id,
      service_id, catalog_endpoint_id, observation_session_id,
      observed_at, evidence_outcome_class, latency_ms
    FROM catalog_ingestion_events
    WHERE event_id = ?
      AND ${OPERATIONAL_READY_PREDICATE}
      AND operational_signal_status IN ('PENDING', 'FAILED')
    LIMIT 1
  `).bind(eventId).first<PendingOperationalRow>();

  return row ? fromRow(row) : null;
}

export async function listPendingOperationalSignalEvents(
  db: D1Database,
  limit = 250,
): Promise<PendingOperationalSignalEvent[]> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT
      event_id, evidence_id,
      organization_id, project_id, environment_id,
      service_id, catalog_endpoint_id, observation_session_id,
      observed_at, evidence_outcome_class, latency_ms
    FROM catalog_ingestion_events
    WHERE ${OPERATIONAL_READY_PREDICATE}
      AND operational_signal_status IN ('PENDING', 'FAILED')
    ORDER BY observed_at ASC, received_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingOperationalRow>();

  return (result.results ?? []).map(fromRow);
}

export async function markOperationalSignalFailure(
  db: D1Database,
  eventId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET operational_signal_status = 'FAILED',
        operational_signal_attempts = operational_signal_attempts + 1,
        operational_signal_last_attempt_at = ?,
        operational_signal_error = ?,
        updated_at = ?
    WHERE event_id = ?
      AND operational_signal_status <> 'PROCESSED'
  `).bind(now, message.slice(0, 1000), now, eventId).run();
}

export async function processOperationalSignalEvent(
  db: D1Database,
  event: PendingOperationalSignalEvent,
  now = new Date().toISOString(),
): Promise<void> {
  const c = deriveOperationalContribution(event.evidenceOutcomeClass);

  const sessionPresence = db.prepare(`
    INSERT INTO catalog_endpoint_session_presence (
      endpoint_id, observation_session_id,
      organization_id, project_id, service_id, environment_id,
      introduced_by_event_id, observation_count,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM catalog_ingestion_events
      WHERE event_id = ?
        AND operational_signal_status IN ('PENDING', 'FAILED')
    )
    ON CONFLICT(endpoint_id, observation_session_id) DO UPDATE SET
      observation_count = catalog_endpoint_session_presence.observation_count + 1,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_session_presence.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_endpoint_session_presence.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_session_presence.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_endpoint_session_presence.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    event.catalogEndpointId,
    event.observationSessionId,
    event.organizationId,
    event.projectId,
    event.serviceId,
    event.environmentId,
    event.eventId,
    event.observedAt,
    event.observedAt,
    now,
    now,
    event.eventId,
  );

  const environmentPresence = db.prepare(`
    INSERT INTO catalog_endpoint_environment_presence (
      endpoint_id, environment_id,
      organization_id, project_id, service_id,
      introduced_by_event_id, observation_count,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM catalog_ingestion_events
      WHERE event_id = ?
        AND operational_signal_status IN ('PENDING', 'FAILED')
    )
    ON CONFLICT(endpoint_id, environment_id) DO UPDATE SET
      observation_count = catalog_endpoint_environment_presence.observation_count + 1,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_environment_presence.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_endpoint_environment_presence.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_environment_presence.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_endpoint_environment_presence.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    event.catalogEndpointId,
    event.environmentId,
    event.organizationId,
    event.projectId,
    event.serviceId,
    event.eventId,
    event.observedAt,
    event.observedAt,
    now,
    now,
    event.eventId,
  );

  const endpointAggregate = db.prepare(`
    INSERT INTO catalog_endpoint_operational_signals (
      endpoint_id, organization_id, project_id, service_id, signal_version,
      observation_count, session_count, environment_count,
      informational_count, success_count, redirect_count,
      client_error_count, server_error_count, network_failure_count, no_status_count,
      latency_observation_count, latency_total_ms, latency_min_ms, latency_max_ms,
      first_seen_at, last_seen_at, first_evidence_id, last_evidence_id,
      created_at, updated_at
    )
    SELECT
      ?, ?, ?, ?, ?,
      1,
      COALESCE((
        SELECT CASE WHEN introduced_by_event_id = ? THEN 1 ELSE 0 END
        FROM catalog_endpoint_session_presence
        WHERE endpoint_id = ? AND observation_session_id = ?
      ), 0),
      COALESCE((
        SELECT CASE WHEN introduced_by_event_id = ? THEN 1 ELSE 0 END
        FROM catalog_endpoint_environment_presence
        WHERE endpoint_id = ? AND environment_id = ?
      ), 0),
      ?, ?, ?, ?, ?, ?, ?,
      1, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM catalog_ingestion_events
      WHERE event_id = ?
        AND operational_signal_status IN ('PENDING', 'FAILED')
    )
    ON CONFLICT(endpoint_id) DO UPDATE SET
      observation_count = catalog_endpoint_operational_signals.observation_count + 1,
      session_count = catalog_endpoint_operational_signals.session_count + excluded.session_count,
      environment_count = catalog_endpoint_operational_signals.environment_count + excluded.environment_count,
      informational_count = catalog_endpoint_operational_signals.informational_count + excluded.informational_count,
      success_count = catalog_endpoint_operational_signals.success_count + excluded.success_count,
      redirect_count = catalog_endpoint_operational_signals.redirect_count + excluded.redirect_count,
      client_error_count = catalog_endpoint_operational_signals.client_error_count + excluded.client_error_count,
      server_error_count = catalog_endpoint_operational_signals.server_error_count + excluded.server_error_count,
      network_failure_count = catalog_endpoint_operational_signals.network_failure_count + excluded.network_failure_count,
      no_status_count = catalog_endpoint_operational_signals.no_status_count + excluded.no_status_count,
      latency_observation_count = catalog_endpoint_operational_signals.latency_observation_count + 1,
      latency_total_ms = catalog_endpoint_operational_signals.latency_total_ms + excluded.latency_total_ms,
      latency_min_ms = CASE
        WHEN catalog_endpoint_operational_signals.latency_min_ms IS NULL
          OR excluded.latency_min_ms < catalog_endpoint_operational_signals.latency_min_ms
        THEN excluded.latency_min_ms ELSE catalog_endpoint_operational_signals.latency_min_ms END,
      latency_max_ms = CASE
        WHEN catalog_endpoint_operational_signals.latency_max_ms IS NULL
          OR excluded.latency_max_ms > catalog_endpoint_operational_signals.latency_max_ms
        THEN excluded.latency_max_ms ELSE catalog_endpoint_operational_signals.latency_max_ms END,
      first_evidence_id = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_operational_signals.first_seen_at
        THEN excluded.first_evidence_id ELSE catalog_endpoint_operational_signals.first_evidence_id END,
      last_evidence_id = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_operational_signals.last_seen_at
        THEN excluded.last_evidence_id ELSE catalog_endpoint_operational_signals.last_evidence_id END,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_operational_signals.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_endpoint_operational_signals.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_operational_signals.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_endpoint_operational_signals.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    event.catalogEndpointId,
    event.organizationId,
    event.projectId,
    event.serviceId,
    OPERATIONAL_SIGNAL_VERSION,
    event.eventId,
    event.catalogEndpointId,
    event.observationSessionId,
    event.eventId,
    event.catalogEndpointId,
    event.environmentId,
    c.informationalCount,
    c.successCount,
    c.redirectCount,
    c.clientErrorCount,
    c.serverErrorCount,
    c.networkFailureCount,
    c.noStatusCount,
    event.latencyMs,
    event.latencyMs,
    event.latencyMs,
    event.observedAt,
    event.observedAt,
    event.evidenceId,
    event.evidenceId,
    now,
    now,
    event.eventId,
  );

  const environmentAggregate = db.prepare(`
    INSERT INTO catalog_endpoint_environment_operational_signals (
      endpoint_id, environment_id,
      organization_id, project_id, service_id, signal_version,
      observation_count, session_count,
      informational_count, success_count, redirect_count,
      client_error_count, server_error_count, network_failure_count, no_status_count,
      latency_observation_count, latency_total_ms, latency_min_ms, latency_max_ms,
      first_seen_at, last_seen_at, first_evidence_id, last_evidence_id,
      created_at, updated_at
    )
    SELECT
      ?, ?, ?, ?, ?, ?,
      1,
      COALESCE((
        SELECT CASE WHEN introduced_by_event_id = ? THEN 1 ELSE 0 END
        FROM catalog_endpoint_session_presence
        WHERE endpoint_id = ? AND observation_session_id = ?
      ), 0),
      ?, ?, ?, ?, ?, ?, ?,
      1, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM catalog_ingestion_events
      WHERE event_id = ?
        AND operational_signal_status IN ('PENDING', 'FAILED')
    )
    ON CONFLICT(endpoint_id, environment_id) DO UPDATE SET
      observation_count = catalog_endpoint_environment_operational_signals.observation_count + 1,
      session_count = catalog_endpoint_environment_operational_signals.session_count + excluded.session_count,
      informational_count = catalog_endpoint_environment_operational_signals.informational_count + excluded.informational_count,
      success_count = catalog_endpoint_environment_operational_signals.success_count + excluded.success_count,
      redirect_count = catalog_endpoint_environment_operational_signals.redirect_count + excluded.redirect_count,
      client_error_count = catalog_endpoint_environment_operational_signals.client_error_count + excluded.client_error_count,
      server_error_count = catalog_endpoint_environment_operational_signals.server_error_count + excluded.server_error_count,
      network_failure_count = catalog_endpoint_environment_operational_signals.network_failure_count + excluded.network_failure_count,
      no_status_count = catalog_endpoint_environment_operational_signals.no_status_count + excluded.no_status_count,
      latency_observation_count = catalog_endpoint_environment_operational_signals.latency_observation_count + 1,
      latency_total_ms = catalog_endpoint_environment_operational_signals.latency_total_ms + excluded.latency_total_ms,
      latency_min_ms = CASE
        WHEN catalog_endpoint_environment_operational_signals.latency_min_ms IS NULL
          OR excluded.latency_min_ms < catalog_endpoint_environment_operational_signals.latency_min_ms
        THEN excluded.latency_min_ms ELSE catalog_endpoint_environment_operational_signals.latency_min_ms END,
      latency_max_ms = CASE
        WHEN catalog_endpoint_environment_operational_signals.latency_max_ms IS NULL
          OR excluded.latency_max_ms > catalog_endpoint_environment_operational_signals.latency_max_ms
        THEN excluded.latency_max_ms ELSE catalog_endpoint_environment_operational_signals.latency_max_ms END,
      first_evidence_id = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_environment_operational_signals.first_seen_at
        THEN excluded.first_evidence_id ELSE catalog_endpoint_environment_operational_signals.first_evidence_id END,
      last_evidence_id = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_environment_operational_signals.last_seen_at
        THEN excluded.last_evidence_id ELSE catalog_endpoint_environment_operational_signals.last_evidence_id END,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_environment_operational_signals.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_endpoint_environment_operational_signals.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_environment_operational_signals.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_endpoint_environment_operational_signals.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    event.catalogEndpointId,
    event.environmentId,
    event.organizationId,
    event.projectId,
    event.serviceId,
    OPERATIONAL_SIGNAL_VERSION,
    event.eventId,
    event.catalogEndpointId,
    event.observationSessionId,
    c.informationalCount,
    c.successCount,
    c.redirectCount,
    c.clientErrorCount,
    c.serverErrorCount,
    c.networkFailureCount,
    c.noStatusCount,
    event.latencyMs,
    event.latencyMs,
    event.latencyMs,
    event.observedAt,
    event.observedAt,
    event.evidenceId,
    event.evidenceId,
    now,
    now,
    event.eventId,
  );

  const markEventProcessed = db.prepare(`
    UPDATE catalog_ingestion_events
    SET operational_signal_status = 'PROCESSED',
        operational_signal_version = ?,
        operational_signal_attempts = operational_signal_attempts + 1,
        operational_signal_last_attempt_at = ?,
        operational_signal_processed_at = COALESCE(operational_signal_processed_at, ?),
        operational_signal_error = NULL,
        updated_at = ?
    WHERE event_id = ?
      AND operational_signal_status IN ('PENDING', 'FAILED')
  `).bind(OPERATIONAL_SIGNAL_VERSION, now, now, now, event.eventId);

  // D1 batch executes these sequentially and atomically. Presence rows are visible
  // to the following aggregate statements, allowing exact distinct-count increments.
  await db.batch([
    sessionPresence,
    environmentPresence,
    endpointAggregate,
    environmentAggregate,
    markEventProcessed,
  ]);
}

export async function processPendingOperationalSignalsBatch(
  db: D1Database,
  limit = 250,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingOperationalSignalEvents(db, limit);
  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processOperationalSignalEvent(db, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markOperationalSignalFailure(db, event.eventId, error);
      console.error("[QAgent Catalog] operational signal aggregation failed", event.eventId, error);
    }
  }

  return { processed, failed };
}
