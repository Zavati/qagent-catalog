import {
  calculateDiscoveryConfidence,
  type DiscoveryConfidenceDecision,
  type DiscoveryConfidenceSignals,
  type ServiceClassification,
} from "../confidence/discoveryConfidence";

interface EndpointCandidateRow {
  endpoint_id: string;
}

interface ConfidenceSignalRow {
  endpoint_id: string;
  method: string;
  normalized_path: string;

  classification: ServiceClassification;
  classification_confidence: number;
  classification_source: string;

  observation_count: number;
  session_count: number;
  environment_count: number;
  informational_count: number;
  success_count: number;
  redirect_count: number;
  client_error_count: number;
  server_error_count: number;
  network_failure_count: number;
  no_status_count: number;
  first_seen_at: string;
  last_seen_at: string;

  schema_track_count: number;
  stable_schema_track_count: number;
  schema_version_count: number;
  max_schema_versions_per_track: number;
  schema_observation_count: number;

  operational_updated_at: string;
  service_updated_at: string;
  schema_updated_at: string | null;
}

function latestTimestamp(...values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? new Date(0).toISOString();
}

export async function listDiscoveryConfidenceCandidates(
  db: D1Database,
  limit = 100,
): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT e.endpoint_id
    FROM catalog_endpoints e
    INNER JOIN catalog_endpoint_operational_signals op
      ON op.endpoint_id = e.endpoint_id
    INNER JOIN catalog_services svc
      ON svc.service_id = e.service_id
    LEFT JOIN (
      SELECT endpoint_id, MAX(updated_at) AS schema_updated_at
      FROM catalog_endpoint_schema_tracks
      GROUP BY endpoint_id
    ) sch ON sch.endpoint_id = e.endpoint_id
    WHERE op.observation_count > 0
      AND svc.classification_status = 'PROCESSED'
      AND (
        e.discovery_confidence_status IN ('PENDING', 'FAILED')
        OR e.discovery_confidence_calculated_at IS NULL
        OR op.updated_at > COALESCE(e.discovery_confidence_input_updated_at, '')
        OR svc.updated_at > COALESCE(e.discovery_confidence_input_updated_at, '')
        OR COALESCE(sch.schema_updated_at, '') > COALESCE(e.discovery_confidence_input_updated_at, '')
      )
    ORDER BY
      CASE WHEN e.discovery_confidence_calculated_at IS NULL THEN 0 ELSE 1 END ASC,
      op.last_seen_at ASC,
      e.endpoint_id ASC
    LIMIT ?
  `).bind(boundedLimit).all<EndpointCandidateRow>();

  return (result.results ?? []).map((row) => row.endpoint_id);
}

export async function loadDiscoveryConfidenceSignals(
  db: D1Database,
  endpointId: string,
): Promise<{ signals: DiscoveryConfidenceSignals; inputUpdatedAt: string }> {
  const row = await db.prepare(`
    SELECT
      e.endpoint_id,
      e.method,
      e.normalized_path,

      svc.classification,
      svc.classification_confidence,
      svc.classification_source,

      op.observation_count,
      op.session_count,
      op.environment_count,
      op.informational_count,
      op.success_count,
      op.redirect_count,
      op.client_error_count,
      op.server_error_count,
      op.network_failure_count,
      op.no_status_count,
      op.first_seen_at,
      op.last_seen_at,

      COALESCE(track.schema_track_count, 0) AS schema_track_count,
      COALESCE(track.stable_schema_track_count, 0) AS stable_schema_track_count,
      COALESCE(track.schema_version_count, 0) AS schema_version_count,
      COALESCE(track.max_schema_versions_per_track, 0) AS max_schema_versions_per_track,
      COALESCE(ver.schema_observation_count, 0) AS schema_observation_count,

      op.updated_at AS operational_updated_at,
      svc.updated_at AS service_updated_at,
      track.schema_updated_at

    FROM catalog_endpoints e
    INNER JOIN catalog_endpoint_operational_signals op
      ON op.endpoint_id = e.endpoint_id
    INNER JOIN catalog_services svc
      ON svc.service_id = e.service_id
    LEFT JOIN (
      SELECT
        endpoint_id,
        COUNT(*) AS schema_track_count,
        SUM(CASE WHEN distinct_version_count = 1 THEN 1 ELSE 0 END) AS stable_schema_track_count,
        SUM(distinct_version_count) AS schema_version_count,
        MAX(distinct_version_count) AS max_schema_versions_per_track,
        MAX(updated_at) AS schema_updated_at
      FROM catalog_endpoint_schema_tracks
      GROUP BY endpoint_id
    ) track ON track.endpoint_id = e.endpoint_id
    LEFT JOIN (
      SELECT endpoint_id, SUM(observation_count) AS schema_observation_count
      FROM catalog_schema_versions
      GROUP BY endpoint_id
    ) ver ON ver.endpoint_id = e.endpoint_id

    WHERE e.endpoint_id = ?
      AND svc.classification_status = 'PROCESSED'
    LIMIT 1
  `).bind(endpointId).first<ConfidenceSignalRow>();

  if (!row) throw new Error("discovery_confidence_signals_not_ready");

  return {
    signals: {
      endpointId: row.endpoint_id,
      method: row.method,
      normalizedPath: row.normalized_path,
      classification: row.classification,
      classificationConfidence: row.classification_confidence,
      classificationSource: row.classification_source,
      observationCount: row.observation_count,
      sessionCount: row.session_count,
      environmentCount: row.environment_count,
      informationalCount: row.informational_count,
      successCount: row.success_count,
      redirectCount: row.redirect_count,
      clientErrorCount: row.client_error_count,
      serverErrorCount: row.server_error_count,
      networkFailureCount: row.network_failure_count,
      noStatusCount: row.no_status_count,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      schemaTrackCount: row.schema_track_count,
      stableSchemaTrackCount: row.stable_schema_track_count,
      schemaVersionCount: row.schema_version_count,
      maxSchemaVersionsPerTrack: row.max_schema_versions_per_track,
      schemaObservationCount: row.schema_observation_count,
    },
    inputUpdatedAt: latestTimestamp(
      row.operational_updated_at,
      row.service_updated_at,
      row.schema_updated_at,
    ),
  };
}

export async function markDiscoveryConfidenceFailure(
  db: D1Database,
  endpointId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_endpoints
    SET discovery_confidence_status = 'FAILED',
        discovery_confidence_attempts = discovery_confidence_attempts + 1,
        discovery_confidence_last_attempt_at = ?,
        discovery_confidence_error = ?,
        updated_at = ?
    WHERE endpoint_id = ?
  `).bind(now, message.slice(0, 1000), now, endpointId).run();
}

export async function applyDiscoveryConfidence(
  db: D1Database,
  endpointId: string,
  decision: DiscoveryConfidenceDecision,
  inputUpdatedAt: string,
  now = new Date().toISOString(),
): Promise<void> {
  await db.prepare(`
    UPDATE catalog_endpoints
    SET discovery_confidence_score = ?,
        discovery_confidence_level = ?,
        discovery_confidence_version = ?,
        discovery_confidence_reasons_json = ?,
        discovery_confidence_signals_json = ?,
        discovery_confidence_status = 'PROCESSED',
        discovery_confidence_attempts = discovery_confidence_attempts + 1,
        discovery_confidence_last_attempt_at = ?,
        discovery_confidence_calculated_at = ?,
        discovery_confidence_input_updated_at = ?,
        discovery_confidence_error = NULL,
        updated_at = ?
    WHERE endpoint_id = ?
  `).bind(
    decision.score,
    decision.level,
    decision.engineVersion,
    JSON.stringify(decision.reasons),
    JSON.stringify(decision.signals),
    now,
    now,
    inputUpdatedAt,
    now,
    endpointId,
  ).run();
}

export async function processDiscoveryConfidence(
  db: D1Database,
  endpointId: string,
): Promise<DiscoveryConfidenceDecision> {
  const { signals, inputUpdatedAt } = await loadDiscoveryConfidenceSignals(db, endpointId);
  const decision = calculateDiscoveryConfidence(signals);
  await applyDiscoveryConfidence(db, endpointId, decision, inputUpdatedAt);
  return decision;
}

export async function processPendingDiscoveryConfidenceBatch(
  db: D1Database,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const pending = await listDiscoveryConfidenceCandidates(db, limit);
  let processed = 0;
  let failed = 0;

  for (const endpointId of pending) {
    try {
      await processDiscoveryConfidence(db, endpointId);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markDiscoveryConfidenceFailure(db, endpointId, error);
      console.error("[QAgent Catalog] discovery confidence failed", endpointId, error);
    }
  }

  return { processed, failed };
}
