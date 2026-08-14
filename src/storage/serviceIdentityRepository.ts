import {
  deriveObservedHostIdentity,
  SERVICE_IDENTITY_STRATEGY,
  SERVICE_IDENTITY_VERSION,
  serviceHostIdFor,
  serviceIdFor,
} from "../serviceIdentity/identity";

export interface PendingCatalogIngestionEvent {
  eventId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  scheme: string;
  host: string;
  observedAt: string;
}

interface ServiceHostBindingRow {
  service_id: string;
  service_host_id: string;
}

interface PendingRow {
  event_id: string;
  organization_id: string;
  project_id: string;
  environment_id: string;
  scheme: string;
  host: string;
  observed_at: string;
}

function laterTimestamp(existingColumn: string): string {
  return `CASE WHEN excluded.last_seen_at > ${existingColumn}.last_seen_at THEN excluded.last_seen_at ELSE ${existingColumn}.last_seen_at END`;
}

export async function loadPendingIngestionEvent(
  db: D1Database,
  eventId: string,
): Promise<PendingCatalogIngestionEvent | null> {
  const row = await db.prepare(`
    SELECT event_id, organization_id, project_id, environment_id, scheme, host, observed_at
    FROM catalog_ingestion_events
    WHERE event_id = ? AND processing_status IN ('PENDING', 'FAILED')
    LIMIT 1
  `).bind(eventId).first<PendingRow>();

  if (!row) return null;
  return {
    eventId: row.event_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    scheme: row.scheme,
    host: row.host,
    observedAt: row.observed_at,
  };
}

export async function listPendingIngestionEvents(
  db: D1Database,
  limit = 100,
): Promise<PendingCatalogIngestionEvent[]> {
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT event_id, organization_id, project_id, environment_id, scheme, host, observed_at
    FROM catalog_ingestion_events
    WHERE processing_status IN ('PENDING', 'FAILED')
    ORDER BY received_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingRow>();

  return (result.results ?? []).map((row) => ({
    eventId: row.event_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    scheme: row.scheme,
    host: row.host,
    observedAt: row.observed_at,
  }));
}

export async function markIngestionProcessingFailure(
  db: D1Database,
  eventId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET processing_status = 'FAILED',
        processing_attempts = processing_attempts + 1,
        last_processing_attempt_at = ?,
        last_error = ?,
        updated_at = ?
    WHERE event_id = ?
  `).bind(now, message.slice(0, 1000), now, eventId).run();
}

export async function processServiceIdentity(
  db: D1Database,
  event: PendingCatalogIngestionEvent,
  now = new Date().toISOString(),
): Promise<{ serviceId: string; serviceHostId: string }> {
  const hostIdentity = deriveObservedHostIdentity(event.scheme, event.host);
  const candidateServiceId = await serviceIdFor(
    event.organizationId,
    event.projectId,
    hostIdentity.serviceKey,
  );
  const candidateServiceHostId = await serviceHostIdFor(
    event.organizationId,
    event.projectId,
    event.environmentId,
    hostIdentity.scheme,
    hostIdentity.authority,
  );

  const serviceUpsert = db.prepare(`
    INSERT INTO catalog_services (
      service_id, organization_id, project_id,
      service_key, display_name,
      identity_strategy, identity_version,
      first_seen_at, last_seen_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, project_id, service_key) DO UPDATE SET
      first_seen_at = CASE WHEN excluded.first_seen_at < catalog_services.first_seen_at THEN excluded.first_seen_at ELSE catalog_services.first_seen_at END,
      last_seen_at = ${laterTimestamp("catalog_services")},
      updated_at = excluded.updated_at
  `).bind(
    candidateServiceId,
    event.organizationId,
    event.projectId,
    hostIdentity.serviceKey,
    hostIdentity.displayName,
    SERVICE_IDENTITY_STRATEGY,
    SERVICE_IDENTITY_VERSION,
    event.observedAt,
    event.observedAt,
    now,
    now,
  );

  // The physical binding is deliberately unique by tenant/project/environment/
  // scheme/authority. On conflict we preserve its existing service_id so a
  // future USER/SYSTEM relink is not silently undone by automatic discovery.
  const hostUpsert = db.prepare(`
    INSERT INTO catalog_service_hosts (
      service_host_id, service_id,
      organization_id, project_id, environment_id,
      scheme, host, hostname, port,
      host_role, mapping_source, mapping_status,
      first_seen_at, last_seen_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OBSERVED', 'DETERMINISTIC', 'ACTIVE', ?, ?, ?, ?)
    ON CONFLICT(organization_id, project_id, environment_id, scheme, host) DO UPDATE SET
      first_seen_at = CASE WHEN excluded.first_seen_at < catalog_service_hosts.first_seen_at THEN excluded.first_seen_at ELSE catalog_service_hosts.first_seen_at END,
      last_seen_at = ${laterTimestamp("catalog_service_hosts")},
      updated_at = excluded.updated_at
  `).bind(
    candidateServiceHostId,
    candidateServiceId,
    event.organizationId,
    event.projectId,
    event.environmentId,
    hostIdentity.scheme,
    hostIdentity.authority,
    hostIdentity.hostname,
    hostIdentity.port,
    event.observedAt,
    event.observedAt,
    now,
    now,
  );

  await db.batch([serviceUpsert, hostUpsert]);

  const binding = await db.prepare(`
    SELECT service_id, service_host_id
    FROM catalog_service_hosts
    WHERE organization_id = ?
      AND project_id = ?
      AND environment_id = ?
      AND scheme = ?
      AND host = ?
    LIMIT 1
  `).bind(
    event.organizationId,
    event.projectId,
    event.environmentId,
    hostIdentity.scheme,
    hostIdentity.authority,
  ).first<ServiceHostBindingRow>();

  if (!binding) throw new Error("service_host_binding_not_found_after_upsert");

  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET service_id = ?,
        service_host_id = ?,
        processing_status = 'PROCESSED',
        processing_attempts = processing_attempts + 1,
        last_processing_attempt_at = ?,
        processed_at = COALESCE(processed_at, ?),
        last_error = NULL,
        updated_at = ?
    WHERE event_id = ?
  `).bind(
    binding.service_id,
    binding.service_host_id,
    now,
    now,
    now,
    event.eventId,
  ).run();

  return { serviceId: binding.service_id, serviceHostId: binding.service_host_id };
}

export async function processPendingServiceIdentityBatch(
  db: D1Database,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingIngestionEvents(db, limit);
  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processServiceIdentity(db, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markIngestionProcessingFailure(db, event.eventId, error);
      console.error("[QAgent Catalog] service identity processing failed", event.eventId, error);
    }
  }

  return { processed, failed };
}
