import {
  classifyService,
  type ClassificationDecision,
  type ServiceClassificationSignals,
} from "../classification/classifier";

interface PendingServiceRow {
  service_id: string;
}

interface SignalRow {
  service_id: string;
  observation_count: number;
  same_origin_count: number;
  same_site_count: number;
  external_count: number;
  unknown_origin_count: number;
  api_transport_count: number;
  static_resource_count: number;
  schema_signal_count: number;
  json_content_type_count: number;
  api_path_count: number;
  no_content_count: number;
  known_analytics_count: number;
  known_observability_count: number;
  tracking_pattern_count: number;
  analytics_signature_code: string | null;
  observability_signature_code: string | null;
}

interface HostRow { hostname: string; }

export async function listPendingServiceClassifications(
  db: D1Database,
  limit = 100,
): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT s.service_id
    FROM catalog_services s
    INNER JOIN catalog_service_classification_signals sig ON sig.service_id = s.service_id
    WHERE s.classification_status IN ('PENDING', 'FAILED')
      AND s.classification_source <> 'USER_CONFIRMED'
    ORDER BY s.last_seen_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingServiceRow>();

  return (result.results ?? []).map((row) => row.service_id);
}

export async function loadServiceClassificationSignals(
  db: D1Database,
  serviceId: string,
): Promise<ServiceClassificationSignals> {
  const row = await db.prepare(`
    SELECT *
    FROM catalog_service_classification_signals
    WHERE service_id = ?
    LIMIT 1
  `).bind(serviceId).first<SignalRow>();

  if (!row) throw new Error("classification_signals_not_found");

  const hosts = await db.prepare(`
    SELECT DISTINCT hostname
    FROM catalog_service_hosts
    WHERE service_id = ? AND mapping_status = 'ACTIVE'
    ORDER BY hostname ASC
    LIMIT 50
  `).bind(serviceId).all<HostRow>();

  return {
    serviceId,
    observationCount: row.observation_count,
    sameOriginCount: row.same_origin_count,
    sameSiteCount: row.same_site_count,
    externalCount: row.external_count,
    unknownOriginCount: row.unknown_origin_count,
    apiTransportCount: row.api_transport_count,
    staticResourceCount: row.static_resource_count,
    schemaSignalCount: row.schema_signal_count,
    jsonContentTypeCount: row.json_content_type_count,
    apiPathCount: row.api_path_count,
    noContentCount: row.no_content_count,
    knownAnalyticsCount: row.known_analytics_count,
    knownObservabilityCount: row.known_observability_count,
    trackingPatternCount: row.tracking_pattern_count,
    analyticsSignatureCode: row.analytics_signature_code,
    observabilitySignatureCode: row.observability_signature_code,
    hostnames: (hosts.results ?? []).map((host) => host.hostname),
  };
}

export async function markServiceClassificationFailure(
  db: D1Database,
  serviceId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_services
    SET classification_status = 'FAILED',
        classification_attempts = classification_attempts + 1,
        classification_last_attempt_at = ?,
        classification_error = ?,
        updated_at = ?
    WHERE service_id = ?
      AND classification_source <> 'USER_CONFIRMED'
  `).bind(now, message.slice(0, 1000), now, serviceId).run();
}

export async function applyServiceClassification(
  db: D1Database,
  serviceId: string,
  decision: ClassificationDecision,
  now = new Date().toISOString(),
): Promise<void> {
  await db.prepare(`
    UPDATE catalog_services
    SET classification = ?,
        classification_confidence = ?,
        classification_source = ?,
        classification_engine_version = ?,
        classification_reasons_json = ?,
        classification_signals_json = ?,
        classification_status = 'PROCESSED',
        classification_attempts = classification_attempts + 1,
        classification_last_attempt_at = ?,
        classified_at = ?,
        classification_error = NULL,
        updated_at = ?
    WHERE service_id = ?
      AND classification_source <> 'USER_CONFIRMED'
  `).bind(
    decision.classification,
    decision.confidence,
    decision.source,
    decision.engineVersion,
    JSON.stringify(decision.reasons),
    JSON.stringify(decision.signals),
    now,
    now,
    now,
    serviceId,
  ).run();
}

export async function processServiceClassification(
  db: D1Database,
  serviceId: string,
): Promise<ClassificationDecision> {
  const signals = await loadServiceClassificationSignals(db, serviceId);
  const decision = classifyService(signals);
  await applyServiceClassification(db, serviceId, decision);
  return decision;
}

export async function processPendingServiceClassificationBatch(
  db: D1Database,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingServiceClassifications(db, limit);
  let processed = 0;
  let failed = 0;

  for (const serviceId of pending) {
    try {
      await processServiceClassification(db, serviceId);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markServiceClassificationFailure(db, serviceId, error);
      console.error("[QAgent Catalog] service classification failed", serviceId, error);
    }
  }

  return { processed, failed };
}
