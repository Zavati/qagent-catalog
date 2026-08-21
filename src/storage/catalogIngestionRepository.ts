import type { CatalogUpdateMessageV1 } from "../contracts/catalogUpdate";

export async function insertCatalogIngestionEvent(
  db: D1Database,
  event: CatalogUpdateMessageV1,
  receivedAt = new Date().toISOString(),
): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO catalog_ingestion_events (
      event_id, schema_version,
      organization_id, project_id, environment_id,
      normalized_event_id, normalized_endpoint_id, observation_session_id, batch_id,
      method, scheme, host, normalized_path,
      observed_at, status_code, network_failure, origin_relation, latency_ms, resource_type,
      auth_observed, auth_scheme,
      request_content_type, response_content_type,
      request_schema_hash, request_schema_json,
      response_schema_hash, response_schema_json,
      emitted_at, received_at, processing_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?
    )
  `).bind(
    event.eventId,
    event.schemaVersion,
    event.context.organizationId,
    event.context.projectId,
    event.context.environmentId,
    event.source.normalizedEventId,
    event.source.normalizedEndpointId,
    event.source.observationSessionId,
    event.source.batchId,
    event.endpoint.method,
    event.endpoint.scheme,
    event.endpoint.host,
    event.endpoint.normalizedPath,
    event.observation.observedAt,
    event.observation.statusCode,
    event.observation.networkFailure ? 1 : 0,
    event.observation.originRelation,
    Math.round(event.observation.latencyMs),
    event.observation.resourceType,
    event.observation.authObserved === undefined ? null : (event.observation.authObserved ? 1 : 0),
    event.observation.authScheme ?? null,
    event.observation.requestContentType,
    event.observation.responseContentType,
    event.schemas.request?.hash ?? null,
    event.schemas.request ? JSON.stringify(event.schemas.request.schema) : null,
    event.schemas.response?.hash ?? null,
    event.schemas.response ? JSON.stringify(event.schemas.response.schema) : null,
    event.emittedAt,
    receivedAt,
    receivedAt,
    receivedAt,
  ).run();
}
