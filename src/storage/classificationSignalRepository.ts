import { deriveClassificationEventSignals } from "../classification/classifier";

export interface PendingClassificationSignalEvent {
  eventId: string;
  serviceId: string;
  host: string;
  normalizedPath: string;
  originRelation: "SAME_ORIGIN" | "SAME_SITE_HEURISTIC" | "EXTERNAL" | "UNKNOWN";
  resourceType: string;
  requestContentType: string | null;
  responseContentType: string | null;
  requestSchemaHash: string | null;
  responseSchemaHash: string | null;
  statusCode: number | null;
  observedAt: string;
}

interface PendingRow {
  event_id: string;
  service_id: string;
  host: string;
  normalized_path: string;
  origin_relation: PendingClassificationSignalEvent["originRelation"];
  resource_type: string;
  request_content_type: string | null;
  response_content_type: string | null;
  request_schema_hash: string | null;
  response_schema_hash: string | null;
  status_code: number | null;
  observed_at: string;
}

export async function listPendingClassificationSignalEvents(
  db: D1Database,
  limit = 100,
): Promise<PendingClassificationSignalEvent[]> {
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT
      event_id, service_id, host, normalized_path, origin_relation, resource_type,
      request_content_type, response_content_type,
      request_schema_hash, response_schema_hash, status_code, observed_at
    FROM catalog_ingestion_events
    WHERE processing_status = 'PROCESSED'
      AND service_id IS NOT NULL
      AND classification_signal_status IN ('PENDING', 'FAILED')
    ORDER BY received_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingRow>();

  return (result.results ?? []).map((row) => ({
    eventId: row.event_id,
    serviceId: row.service_id,
    host: row.host,
    normalizedPath: row.normalized_path,
    originRelation: row.origin_relation,
    resourceType: row.resource_type,
    requestContentType: row.request_content_type,
    responseContentType: row.response_content_type,
    requestSchemaHash: row.request_schema_hash,
    responseSchemaHash: row.response_schema_hash,
    statusCode: row.status_code,
    observedAt: row.observed_at,
  }));
}

export async function markClassificationSignalFailure(
  db: D1Database,
  eventId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET classification_signal_status = 'FAILED',
        classification_signal_attempts = classification_signal_attempts + 1,
        classification_signal_last_attempt_at = ?,
        classification_signal_error = ?,
        updated_at = ?
    WHERE event_id = ?
  `).bind(now, message.slice(0, 1000), now, eventId).run();
}

export async function processClassificationSignalEvent(
  db: D1Database,
  event: PendingClassificationSignalEvent,
  now = new Date().toISOString(),
): Promise<void> {
  const signal = deriveClassificationEventSignals({
    host: event.host,
    normalizedPath: event.normalizedPath,
    originRelation: event.originRelation,
    resourceType: event.resourceType,
    requestContentType: event.requestContentType,
    responseContentType: event.responseContentType,
    requestSchemaHash: event.requestSchemaHash,
    responseSchemaHash: event.responseSchemaHash,
    statusCode: event.statusCode,
  });

  const aggregateUpsert = db.prepare(`
    INSERT INTO catalog_service_classification_signals (
      service_id,
      observation_count,
      same_origin_count, same_site_count, external_count, unknown_origin_count,
      api_transport_count, static_resource_count,
      schema_signal_count, json_content_type_count, api_path_count, no_content_count,
      known_analytics_count, known_observability_count, tracking_pattern_count,
      analytics_signature_code, observability_signature_code,
      first_signal_at, last_signal_at, updated_at
    )
    SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1
      FROM catalog_ingestion_events
      WHERE event_id = ?
        AND classification_signal_status IN ('PENDING', 'FAILED')
    )
    ON CONFLICT(service_id) DO UPDATE SET
      observation_count = catalog_service_classification_signals.observation_count + 1,
      same_origin_count = catalog_service_classification_signals.same_origin_count + excluded.same_origin_count,
      same_site_count = catalog_service_classification_signals.same_site_count + excluded.same_site_count,
      external_count = catalog_service_classification_signals.external_count + excluded.external_count,
      unknown_origin_count = catalog_service_classification_signals.unknown_origin_count + excluded.unknown_origin_count,
      api_transport_count = catalog_service_classification_signals.api_transport_count + excluded.api_transport_count,
      static_resource_count = catalog_service_classification_signals.static_resource_count + excluded.static_resource_count,
      schema_signal_count = catalog_service_classification_signals.schema_signal_count + excluded.schema_signal_count,
      json_content_type_count = catalog_service_classification_signals.json_content_type_count + excluded.json_content_type_count,
      api_path_count = catalog_service_classification_signals.api_path_count + excluded.api_path_count,
      no_content_count = catalog_service_classification_signals.no_content_count + excluded.no_content_count,
      known_analytics_count = catalog_service_classification_signals.known_analytics_count + excluded.known_analytics_count,
      known_observability_count = catalog_service_classification_signals.known_observability_count + excluded.known_observability_count,
      tracking_pattern_count = catalog_service_classification_signals.tracking_pattern_count + excluded.tracking_pattern_count,
      analytics_signature_code = COALESCE(catalog_service_classification_signals.analytics_signature_code, excluded.analytics_signature_code),
      observability_signature_code = COALESCE(catalog_service_classification_signals.observability_signature_code, excluded.observability_signature_code),
      first_signal_at = CASE WHEN excluded.first_signal_at < catalog_service_classification_signals.first_signal_at THEN excluded.first_signal_at ELSE catalog_service_classification_signals.first_signal_at END,
      last_signal_at = CASE WHEN excluded.last_signal_at > catalog_service_classification_signals.last_signal_at THEN excluded.last_signal_at ELSE catalog_service_classification_signals.last_signal_at END,
      updated_at = excluded.updated_at
  `).bind(
    event.serviceId,
    signal.sameOrigin,
    signal.sameSite,
    signal.external,
    signal.unknownOrigin,
    signal.apiTransport,
    signal.staticResource,
    signal.schemaSignal,
    signal.jsonContentType,
    signal.apiPath,
    signal.noContent,
    signal.knownAnalytics,
    signal.knownObservability,
    signal.trackingPattern,
    signal.analyticsSignatureCode,
    signal.observabilitySignatureCode,
    event.observedAt,
    event.observedAt,
    now,
    event.eventId,
  );

  const markServicePending = db.prepare(`
    UPDATE catalog_services
    SET classification_status = CASE
          WHEN classification_source = 'USER_CONFIRMED' THEN classification_status
          ELSE 'PENDING'
        END,
        classification_error = CASE
          WHEN classification_source = 'USER_CONFIRMED' THEN classification_error
          ELSE NULL
        END,
        updated_at = ?
    WHERE service_id = ?
      AND EXISTS (
        SELECT 1
        FROM catalog_ingestion_events
        WHERE event_id = ?
          AND classification_signal_status IN ('PENDING', 'FAILED')
      )
  `).bind(now, event.serviceId, event.eventId);

  const markEventProcessed = db.prepare(`
    UPDATE catalog_ingestion_events
    SET classification_signal_status = 'PROCESSED',
        classification_signal_attempts = classification_signal_attempts + 1,
        classification_signal_last_attempt_at = ?,
        classification_signal_processed_at = COALESCE(classification_signal_processed_at, ?),
        classification_signal_error = NULL,
        updated_at = ?
    WHERE event_id = ?
      AND classification_signal_status IN ('PENDING', 'FAILED')
  `).bind(now, now, now, event.eventId);

  await db.batch([aggregateUpsert, markServicePending, markEventProcessed]);
}

export async function processPendingClassificationSignalBatch(
  db: D1Database,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingClassificationSignalEvents(db, limit);
  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processClassificationSignalEvent(db, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markClassificationSignalFailure(db, event.eventId, error);
      console.error("[QAgent Catalog] classification signal aggregation failed", event.eventId, error);
    }
  }

  return { processed, failed };
}
