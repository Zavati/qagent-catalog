import {
  catalogEndpointBindingIdFor,
  catalogEndpointIdFor,
  deriveLogicalEndpointIdentity,
  LOGICAL_ENDPOINT_IDENTITY_STRATEGY,
  LOGICAL_ENDPOINT_IDENTITY_VERSION,
} from "../endpointIdentity/identity";

export interface PendingEndpointIdentityEvent {
  eventId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  serviceHostId: string;
  method: string;
  normalizedPath: string;
  observedAt: string;
}

interface PendingRow {
  event_id: string;
  organization_id: string;
  project_id: string;
  environment_id: string;
  service_id: string;
  service_host_id: string;
  method: string;
  normalized_path: string;
  observed_at: string;
}

function laterTimestamp(existingColumn: string): string {
  return `CASE WHEN excluded.last_seen_at > ${existingColumn}.last_seen_at THEN excluded.last_seen_at ELSE ${existingColumn}.last_seen_at END`;
}

export async function loadPendingEndpointIdentityEvent(
  db: D1Database,
  eventId: string,
): Promise<PendingEndpointIdentityEvent | null> {
  const row = await db.prepare(`
    SELECT
      event_id, organization_id, project_id, environment_id,
      service_id, service_host_id, method, normalized_path, observed_at
    FROM catalog_ingestion_events
    WHERE event_id = ?
      AND processing_status = 'PROCESSED'
      AND endpoint_identity_status IN ('PENDING', 'FAILED')
      AND service_id IS NOT NULL
      AND service_host_id IS NOT NULL
    LIMIT 1
  `).bind(eventId).first<PendingRow>();

  if (!row) return null;
  return {
    eventId: row.event_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    serviceId: row.service_id,
    serviceHostId: row.service_host_id,
    method: row.method,
    normalizedPath: row.normalized_path,
    observedAt: row.observed_at,
  };
}

export async function listPendingEndpointIdentityEvents(
  db: D1Database,
  limit = 100,
): Promise<PendingEndpointIdentityEvent[]> {
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT
      event_id, organization_id, project_id, environment_id,
      service_id, service_host_id, method, normalized_path, observed_at
    FROM catalog_ingestion_events
    WHERE processing_status = 'PROCESSED'
      AND endpoint_identity_status IN ('PENDING', 'FAILED')
      AND service_id IS NOT NULL
      AND service_host_id IS NOT NULL
    ORDER BY received_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingRow>();

  return (result.results ?? []).map((row) => ({
    eventId: row.event_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    serviceId: row.service_id,
    serviceHostId: row.service_host_id,
    method: row.method,
    normalizedPath: row.normalized_path,
    observedAt: row.observed_at,
  }));
}

export async function markEndpointIdentityFailure(
  db: D1Database,
  eventId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET endpoint_identity_status = 'FAILED',
        endpoint_identity_attempts = endpoint_identity_attempts + 1,
        endpoint_identity_last_attempt_at = ?,
        endpoint_identity_error = ?,
        updated_at = ?
    WHERE event_id = ?
  `).bind(now, message.slice(0, 1000), now, eventId).run();
}

export async function processLogicalEndpointIdentity(
  db: D1Database,
  event: PendingEndpointIdentityEvent,
  now = new Date().toISOString(),
): Promise<{ endpointId: string; endpointBindingId: string }> {
  const identity = deriveLogicalEndpointIdentity(event.method, event.normalizedPath);
  const endpointId = await catalogEndpointIdFor(
    event.organizationId,
    event.projectId,
    event.serviceId,
    identity.method,
    identity.normalizedPath,
  );
  const endpointBindingId = await catalogEndpointBindingIdFor(
    event.organizationId,
    event.projectId,
    endpointId,
    event.serviceHostId,
  );

  const endpointUpsert = db.prepare(`
    INSERT INTO catalog_endpoints (
      endpoint_id, organization_id, project_id, service_id,
      method, normalized_path, endpoint_key,
      identity_strategy, identity_version,
      first_seen_at, last_seen_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, project_id, service_id, method, normalized_path) DO UPDATE SET
      first_seen_at = CASE WHEN excluded.first_seen_at < catalog_endpoints.first_seen_at THEN excluded.first_seen_at ELSE catalog_endpoints.first_seen_at END,
      last_seen_at = ${laterTimestamp("catalog_endpoints")},
      updated_at = excluded.updated_at
  `).bind(
    endpointId,
    event.organizationId,
    event.projectId,
    event.serviceId,
    identity.method,
    identity.normalizedPath,
    identity.endpointKey,
    LOGICAL_ENDPOINT_IDENTITY_STRATEGY,
    LOGICAL_ENDPOINT_IDENTITY_VERSION,
    event.observedAt,
    event.observedAt,
    now,
    now,
  );

  const bindingUpsert = db.prepare(`
    INSERT INTO catalog_endpoint_bindings (
      endpoint_binding_id, endpoint_id, service_id, service_host_id,
      organization_id, project_id, environment_id,
      first_seen_at, last_seen_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint_id, service_host_id) DO UPDATE SET
      first_seen_at = CASE WHEN excluded.first_seen_at < catalog_endpoint_bindings.first_seen_at THEN excluded.first_seen_at ELSE catalog_endpoint_bindings.first_seen_at END,
      last_seen_at = ${laterTimestamp("catalog_endpoint_bindings")},
      updated_at = excluded.updated_at
  `).bind(
    endpointBindingId,
    endpointId,
    event.serviceId,
    event.serviceHostId,
    event.organizationId,
    event.projectId,
    event.environmentId,
    event.observedAt,
    event.observedAt,
    now,
    now,
  );

  await db.batch([endpointUpsert, bindingUpsert]);

  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET catalog_endpoint_id = ?,
        endpoint_identity_status = 'PROCESSED',
        endpoint_identity_attempts = endpoint_identity_attempts + 1,
        endpoint_identity_last_attempt_at = ?,
        endpoint_identity_processed_at = COALESCE(endpoint_identity_processed_at, ?),
        endpoint_identity_error = NULL,
        updated_at = ?
    WHERE event_id = ?
  `).bind(endpointId, now, now, now, event.eventId).run();

  return { endpointId, endpointBindingId };
}

export async function processPendingEndpointIdentityBatch(
  db: D1Database,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingEndpointIdentityEvents(db, limit);
  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processLogicalEndpointIdentity(db, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markEndpointIdentityFailure(db, event.eventId, error);
      console.error("[QAgent Catalog] logical endpoint identity processing failed", event.eventId, error);
    }
  }

  return { processed, failed };
}
