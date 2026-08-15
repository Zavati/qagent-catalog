import {
  EVIDENCE_KIND,
  EVIDENCE_MODEL_VERSION,
  deriveEvidenceOutcomeClass,
  evidenceFingerprintFor,
  evidenceIdFor,
  type EvidenceFingerprintInput,
} from "../evidence/evidenceModel";

export interface PendingEvidenceEvent extends EvidenceFingerprintInput {
  serviceId: string;
  serviceHostId: string;
  catalogEndpointId: string;
  requestSchemaVersionId: string | null;
  responseSchemaVersionId: string | null;
}

interface PendingEvidenceRow {
  event_id: string;
  schema_version: string;
  organization_id: string;
  project_id: string;
  environment_id: string;
  normalized_event_id: string;
  normalized_endpoint_id: string;
  observation_session_id: string;
  batch_id: string;
  service_id: string;
  service_host_id: string;
  catalog_endpoint_id: string;
  method: string;
  scheme: string;
  host: string;
  normalized_path: string;
  observed_at: string;
  status_code: number | null;
  network_failure: number;
  origin_relation: string;
  latency_ms: number;
  resource_type: string;
  request_content_type: string | null;
  response_content_type: string | null;
  request_schema_hash: string | null;
  response_schema_hash: string | null;
  request_schema_version_id: string | null;
  response_schema_version_id: string | null;
}

function fromRow(row: PendingEvidenceRow): PendingEvidenceEvent {
  return {
    eventId: row.event_id,
    schemaVersion: row.schema_version,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    normalizedEventId: row.normalized_event_id,
    normalizedEndpointId: row.normalized_endpoint_id,
    observationSessionId: row.observation_session_id,
    batchId: row.batch_id,
    serviceId: row.service_id,
    serviceHostId: row.service_host_id,
    catalogEndpointId: row.catalog_endpoint_id,
    method: row.method,
    scheme: row.scheme,
    host: row.host,
    normalizedPath: row.normalized_path,
    observedAt: row.observed_at,
    statusCode: row.status_code,
    networkFailure: row.network_failure === 1,
    originRelation: row.origin_relation,
    latencyMs: row.latency_ms,
    resourceType: row.resource_type,
    requestContentType: row.request_content_type,
    responseContentType: row.response_content_type,
    requestSchemaHash: row.request_schema_hash,
    responseSchemaHash: row.response_schema_hash,
    requestSchemaVersionId: row.request_schema_version_id,
    responseSchemaVersionId: row.response_schema_version_id,
  };
}

const EVIDENCE_READY_PREDICATE = `
  processing_status = 'PROCESSED'
  AND endpoint_identity_status = 'PROCESSED'
  AND schema_consolidation_status = 'PROCESSED'
  AND service_id IS NOT NULL
  AND service_host_id IS NOT NULL
  AND catalog_endpoint_id IS NOT NULL
`;

export async function loadPendingEvidenceEvent(
  db: D1Database,
  eventId: string,
): Promise<PendingEvidenceEvent | null> {
  const row = await db.prepare(`
    SELECT
      event_id, schema_version,
      organization_id, project_id, environment_id,
      normalized_event_id, normalized_endpoint_id, observation_session_id, batch_id,
      service_id, service_host_id, catalog_endpoint_id,
      method, scheme, host, normalized_path,
      observed_at, status_code, network_failure, origin_relation, latency_ms, resource_type,
      request_content_type, response_content_type,
      request_schema_hash, response_schema_hash,
      request_schema_version_id, response_schema_version_id
    FROM catalog_ingestion_events
    WHERE event_id = ?
      AND ${EVIDENCE_READY_PREDICATE}
      AND evidence_status IN ('PENDING', 'FAILED')
    LIMIT 1
  `).bind(eventId).first<PendingEvidenceRow>();

  return row ? fromRow(row) : null;
}

export async function listPendingEvidenceEvents(
  db: D1Database,
  limit = 250,
): Promise<PendingEvidenceEvent[]> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT
      event_id, schema_version,
      organization_id, project_id, environment_id,
      normalized_event_id, normalized_endpoint_id, observation_session_id, batch_id,
      service_id, service_host_id, catalog_endpoint_id,
      method, scheme, host, normalized_path,
      observed_at, status_code, network_failure, origin_relation, latency_ms, resource_type,
      request_content_type, response_content_type,
      request_schema_hash, response_schema_hash,
      request_schema_version_id, response_schema_version_id
    FROM catalog_ingestion_events
    WHERE ${EVIDENCE_READY_PREDICATE}
      AND evidence_status IN ('PENDING', 'FAILED')
    ORDER BY observed_at ASC, received_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingEvidenceRow>();

  return (result.results ?? []).map(fromRow);
}

export async function markEvidenceFailure(
  db: D1Database,
  eventId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET evidence_status = 'FAILED',
        evidence_attempts = evidence_attempts + 1,
        evidence_last_attempt_at = ?,
        evidence_error = ?,
        updated_at = ?
    WHERE event_id = ?
  `).bind(now, message.slice(0, 1000), now, eventId).run();
}

export async function processEvidenceMaterialization(
  db: D1Database,
  event: PendingEvidenceEvent,
  now = new Date().toISOString(),
): Promise<{ evidenceId: string; evidenceFingerprint: string }> {
  const evidenceId = await evidenceIdFor(event.organizationId, event.projectId, event.eventId);
  const evidenceFingerprint = await evidenceFingerprintFor(event);
  const outcomeClass = deriveEvidenceOutcomeClass(event.statusCode, event.networkFailure);

  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET evidence_id = ?,
        evidence_model_version = ?,
        evidence_kind = ?,
        evidence_outcome_class = ?,
        evidence_fingerprint = ?,
        evidence_status = 'PROCESSED',
        evidence_attempts = evidence_attempts + 1,
        evidence_last_attempt_at = ?,
        evidence_ready_at = COALESCE(evidence_ready_at, ?),
        evidence_error = NULL,
        updated_at = ?
    WHERE event_id = ?
      AND evidence_status IN ('PENDING', 'FAILED')
  `).bind(
    evidenceId,
    EVIDENCE_MODEL_VERSION,
    EVIDENCE_KIND,
    outcomeClass,
    evidenceFingerprint,
    now,
    now,
    now,
    event.eventId,
  ).run();

  return { evidenceId, evidenceFingerprint };
}

export async function processPendingEvidenceBatch(
  db: D1Database,
  limit = 250,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingEvidenceEvents(db, limit);
  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processEvidenceMaterialization(db, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markEvidenceFailure(db, event.eventId, error);
      console.error("[QAgent Catalog] evidence materialization failed", event.eventId, error);
    }
  }

  return { processed, failed };
}
