import type { InferredSchema } from "../contracts/catalogUpdate";
import {
  assertStructuralSchemaHash,
  canonicalSchemaJson,
  normalizeSchemaContentType,
  SCHEMA_VERSIONING_STRATEGY,
  SCHEMA_VERSIONING_VERSION,
  schemaEnvironmentStateIdFor,
  schemaStatusKey,
  schemaStructureStats,
  schemaTrackIdFor,
  schemaVersionIdFor,
  type SchemaDirection,
} from "../schema/schemaVersioning";

export interface PendingSchemaConsolidationEvent {
  eventId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  endpointId: string;
  observedAt: string;
  statusCode: number | null;
  requestContentType: string | null;
  responseContentType: string | null;
  requestSchemaHash: string | null;
  requestSchemaJson: string | null;
  responseSchemaHash: string | null;
  responseSchemaJson: string | null;
}

interface PendingRow {
  event_id: string;
  organization_id: string;
  project_id: string;
  environment_id: string;
  catalog_endpoint_id: string;
  observed_at: string;
  status_code: number | null;
  request_content_type: string | null;
  response_content_type: string | null;
  request_schema_hash: string | null;
  request_schema_json: string | null;
  response_schema_hash: string | null;
  response_schema_json: string | null;
}

interface PreparedSchemaSignal {
  direction: SchemaDirection;
  statusCode: number | null;
  statusKey: string;
  schemaHash: string;
  schemaJson: string;
  contentType: string | null;
  schemaTrackId: string;
  schemaVersionId: string;
  environmentStateId: string;
  isPartial: number;
  nodeCount: number;
  propertyCount: number;
  maxDepth: number;
}

function parseStoredSchema(value: string): InferredSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("stored_schema_json_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("type" in parsed)) {
    throw new Error("stored_schema_shape_invalid");
  }
  return parsed as InferredSchema;
}

async function prepareSignal(
  event: PendingSchemaConsolidationEvent,
  direction: SchemaDirection,
  schemaHash: string,
  storedSchemaJson: string,
  contentType: string | null,
): Promise<PreparedSchemaSignal> {
  const schema = parseStoredSchema(storedSchemaJson);
  await assertStructuralSchemaHash(schema, schemaHash);

  const statusCode = direction === "REQUEST" ? null : event.statusCode;
  const statusKey = schemaStatusKey(direction, statusCode);
  const schemaTrackId = await schemaTrackIdFor(
    event.organizationId,
    event.projectId,
    event.endpointId,
    direction,
    statusKey,
  );
  const schemaVersionId = await schemaVersionIdFor(schemaTrackId, schemaHash);
  const environmentStateId = await schemaEnvironmentStateIdFor(schemaTrackId, event.environmentId);
  const stats = schemaStructureStats(schema);

  return {
    direction,
    statusCode,
    statusKey,
    schemaHash,
    schemaJson: canonicalSchemaJson(schema),
    contentType: normalizeSchemaContentType(contentType),
    schemaTrackId,
    schemaVersionId,
    environmentStateId,
    isPartial: stats.isPartial ? 1 : 0,
    nodeCount: stats.nodeCount,
    propertyCount: stats.propertyCount,
    maxDepth: stats.maxDepth,
  };
}

function fromRow(row: PendingRow): PendingSchemaConsolidationEvent {
  return {
    eventId: row.event_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    endpointId: row.catalog_endpoint_id,
    observedAt: row.observed_at,
    statusCode: row.status_code,
    requestContentType: row.request_content_type,
    responseContentType: row.response_content_type,
    requestSchemaHash: row.request_schema_hash,
    requestSchemaJson: row.request_schema_json,
    responseSchemaHash: row.response_schema_hash,
    responseSchemaJson: row.response_schema_json,
  };
}

export async function loadPendingSchemaConsolidationEvent(
  db: D1Database,
  eventId: string,
): Promise<PendingSchemaConsolidationEvent | null> {
  const row = await db.prepare(`
    SELECT
      event_id, organization_id, project_id, environment_id,
      catalog_endpoint_id, observed_at, status_code,
      request_content_type, response_content_type,
      request_schema_hash, request_schema_json,
      response_schema_hash, response_schema_json
    FROM catalog_ingestion_events
    WHERE event_id = ?
      AND processing_status = 'PROCESSED'
      AND endpoint_identity_status = 'PROCESSED'
      AND catalog_endpoint_id IS NOT NULL
      AND schema_consolidation_status IN ('PENDING', 'FAILED')
    LIMIT 1
  `).bind(eventId).first<PendingRow>();

  return row ? fromRow(row) : null;
}

export async function listPendingSchemaConsolidationEvents(
  db: D1Database,
  limit = 100,
): Promise<PendingSchemaConsolidationEvent[]> {
  const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT
      event_id, organization_id, project_id, environment_id,
      catalog_endpoint_id, observed_at, status_code,
      request_content_type, response_content_type,
      request_schema_hash, request_schema_json,
      response_schema_hash, response_schema_json
    FROM catalog_ingestion_events
    WHERE processing_status = 'PROCESSED'
      AND endpoint_identity_status = 'PROCESSED'
      AND catalog_endpoint_id IS NOT NULL
      AND schema_consolidation_status IN ('PENDING', 'FAILED')
    ORDER BY observed_at ASC, received_at ASC
    LIMIT ?
  `).bind(boundedLimit).all<PendingRow>();

  return (result.results ?? []).map(fromRow);
}

export async function markSchemaConsolidationFailure(
  db: D1Database,
  eventId: string,
  error: unknown,
  now = new Date().toISOString(),
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(`
    UPDATE catalog_ingestion_events
    SET schema_consolidation_status = 'FAILED',
        schema_consolidation_attempts = schema_consolidation_attempts + 1,
        schema_consolidation_last_attempt_at = ?,
        schema_consolidation_error = ?,
        updated_at = ?
    WHERE event_id = ?
  `).bind(now, message.slice(0, 1000), now, eventId).run();
}

function trackUpsert(
  db: D1Database,
  event: PendingSchemaConsolidationEvent,
  signal: PreparedSchemaSignal,
  now: string,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO catalog_endpoint_schema_tracks (
      schema_track_id, endpoint_id, organization_id, project_id,
      direction, status_key, status_code,
      versioning_strategy, versioning_version,
      current_schema_version_id, current_schema_hash, current_version_number, current_observed_at,
      distinct_version_count,
      first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?, ?, ?, ?)
    ON CONFLICT(endpoint_id, direction, status_key) DO UPDATE SET
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_endpoint_schema_tracks.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_endpoint_schema_tracks.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_endpoint_schema_tracks.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_endpoint_schema_tracks.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    signal.schemaTrackId,
    event.endpointId,
    event.organizationId,
    event.projectId,
    signal.direction,
    signal.statusKey,
    signal.statusCode,
    SCHEMA_VERSIONING_STRATEGY,
    SCHEMA_VERSIONING_VERSION,
    event.observedAt,
    event.observedAt,
    now,
    now,
  );
}

function versionUpsert(
  db: D1Database,
  event: PendingSchemaConsolidationEvent,
  signal: PreparedSchemaSignal,
  now: string,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO catalog_schema_versions (
      schema_version_id, schema_track_id, endpoint_id, organization_id, project_id,
      direction, status_key, status_code, version_number,
      schema_hash, schema_json, is_partial, node_count, property_count, max_depth,
      predecessor_schema_version_id, introduced_by_event_id,
      first_event_id, last_event_id, observation_count,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      ?, ?, ?, ?, ?, ?, ?, ?,
      COALESCE((SELECT MAX(version_number) FROM catalog_schema_versions WHERE schema_track_id = ?), 0) + 1,
      ?, ?, ?, ?, ?, ?,
      (SELECT current_schema_version_id FROM catalog_endpoint_schema_tracks WHERE schema_track_id = ?),
      ?, ?, ?, 1, ?, ?, ?, ?
    ON CONFLICT(schema_track_id, schema_hash) DO UPDATE SET
      first_event_id = CASE
        WHEN excluded.first_seen_at < catalog_schema_versions.first_seen_at
        THEN excluded.first_event_id ELSE catalog_schema_versions.first_event_id END,
      last_event_id = CASE
        WHEN excluded.last_seen_at >= catalog_schema_versions.last_seen_at
        THEN excluded.last_event_id ELSE catalog_schema_versions.last_event_id END,
      observation_count = catalog_schema_versions.observation_count + 1,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_schema_versions.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_schema_versions.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_schema_versions.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_schema_versions.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    signal.schemaVersionId,
    signal.schemaTrackId,
    event.endpointId,
    event.organizationId,
    event.projectId,
    signal.direction,
    signal.statusKey,
    signal.statusCode,
    signal.schemaTrackId,
    signal.schemaHash,
    signal.schemaJson,
    signal.isPartial,
    signal.nodeCount,
    signal.propertyCount,
    signal.maxDepth,
    signal.schemaTrackId,
    event.eventId,
    event.eventId,
    event.eventId,
    event.observedAt,
    event.observedAt,
    now,
    now,
  );
}

function trackCurrentState(
  db: D1Database,
  event: PendingSchemaConsolidationEvent,
  signal: PreparedSchemaSignal,
  now: string,
): D1PreparedStatement {
  return db.prepare(`
    UPDATE catalog_endpoint_schema_tracks
    SET current_schema_version_id = CASE
          WHEN current_observed_at IS NULL OR ? >= current_observed_at THEN ?
          ELSE current_schema_version_id END,
        current_schema_hash = CASE
          WHEN current_observed_at IS NULL OR ? >= current_observed_at THEN ?
          ELSE current_schema_hash END,
        current_version_number = CASE
          WHEN current_observed_at IS NULL OR ? >= current_observed_at
          THEN (SELECT version_number FROM catalog_schema_versions WHERE schema_version_id = ?)
          ELSE current_version_number END,
        current_observed_at = CASE
          WHEN current_observed_at IS NULL OR ? >= current_observed_at THEN ?
          ELSE current_observed_at END,
        distinct_version_count = (
          SELECT COUNT(*) FROM catalog_schema_versions WHERE schema_track_id = ?
        ),
        first_seen_at = CASE WHEN ? < first_seen_at THEN ? ELSE first_seen_at END,
        last_seen_at = CASE WHEN ? > last_seen_at THEN ? ELSE last_seen_at END,
        updated_at = ?
    WHERE schema_track_id = ?
  `).bind(
    event.observedAt,
    signal.schemaVersionId,
    event.observedAt,
    signal.schemaHash,
    event.observedAt,
    signal.schemaVersionId,
    event.observedAt,
    event.observedAt,
    signal.schemaTrackId,
    event.observedAt,
    event.observedAt,
    event.observedAt,
    event.observedAt,
    now,
    signal.schemaTrackId,
  );
}

function environmentStateUpsert(
  db: D1Database,
  event: PendingSchemaConsolidationEvent,
  signal: PreparedSchemaSignal,
  now: string,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO catalog_schema_environment_state (
      schema_environment_state_id, schema_track_id, endpoint_id,
      organization_id, project_id, environment_id,
      current_schema_version_id, current_schema_hash, current_version_number, current_observed_at,
      observation_count, first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      ?, ?, ?, ?, ?, ?, ?, ?, version_number, ?, 1, ?, ?, ?, ?
    FROM catalog_schema_versions
    WHERE schema_version_id = ?
    ON CONFLICT(schema_track_id, environment_id) DO UPDATE SET
      current_schema_version_id = CASE
        WHEN excluded.current_observed_at >= catalog_schema_environment_state.current_observed_at
        THEN excluded.current_schema_version_id ELSE catalog_schema_environment_state.current_schema_version_id END,
      current_schema_hash = CASE
        WHEN excluded.current_observed_at >= catalog_schema_environment_state.current_observed_at
        THEN excluded.current_schema_hash ELSE catalog_schema_environment_state.current_schema_hash END,
      current_version_number = CASE
        WHEN excluded.current_observed_at >= catalog_schema_environment_state.current_observed_at
        THEN excluded.current_version_number ELSE catalog_schema_environment_state.current_version_number END,
      current_observed_at = CASE
        WHEN excluded.current_observed_at >= catalog_schema_environment_state.current_observed_at
        THEN excluded.current_observed_at ELSE catalog_schema_environment_state.current_observed_at END,
      observation_count = catalog_schema_environment_state.observation_count + 1,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_schema_environment_state.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_schema_environment_state.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_schema_environment_state.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_schema_environment_state.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    signal.environmentStateId,
    signal.schemaTrackId,
    event.endpointId,
    event.organizationId,
    event.projectId,
    event.environmentId,
    signal.schemaVersionId,
    signal.schemaHash,
    event.observedAt,
    event.observedAt,
    event.observedAt,
    now,
    now,
    signal.schemaVersionId,
  );
}

function contentTypeUpsert(
  db: D1Database,
  event: PendingSchemaConsolidationEvent,
  signal: PreparedSchemaSignal,
  now: string,
): D1PreparedStatement | null {
  if (!signal.contentType) return null;

  return db.prepare(`
    INSERT INTO catalog_schema_version_content_types (
      schema_version_id, content_type, observation_count, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(schema_version_id, content_type) DO UPDATE SET
      observation_count = catalog_schema_version_content_types.observation_count + 1,
      first_seen_at = CASE
        WHEN excluded.first_seen_at < catalog_schema_version_content_types.first_seen_at
        THEN excluded.first_seen_at ELSE catalog_schema_version_content_types.first_seen_at END,
      last_seen_at = CASE
        WHEN excluded.last_seen_at > catalog_schema_version_content_types.last_seen_at
        THEN excluded.last_seen_at ELSE catalog_schema_version_content_types.last_seen_at END,
      updated_at = excluded.updated_at
  `).bind(
    signal.schemaVersionId,
    signal.contentType,
    event.observedAt,
    event.observedAt,
    now,
  );
}

export async function processSchemaConsolidation(
  db: D1Database,
  event: PendingSchemaConsolidationEvent,
  now = new Date().toISOString(),
): Promise<{ requestSchemaVersionId: string | null; responseSchemaVersionId: string | null }> {
  if ((event.requestSchemaHash === null) !== (event.requestSchemaJson === null)) {
    throw new Error("request_schema_signal_incomplete");
  }
  if ((event.responseSchemaHash === null) !== (event.responseSchemaJson === null)) {
    throw new Error("response_schema_signal_incomplete");
  }

  const signals: PreparedSchemaSignal[] = [];
  if (event.requestSchemaHash && event.requestSchemaJson) {
    signals.push(await prepareSignal(
      event,
      "REQUEST",
      event.requestSchemaHash,
      event.requestSchemaJson,
      event.requestContentType,
    ));
  }
  if (event.responseSchemaHash && event.responseSchemaJson) {
    signals.push(await prepareSignal(
      event,
      "RESPONSE",
      event.responseSchemaHash,
      event.responseSchemaJson,
      event.responseContentType,
    ));
  }

  const request = signals.find((signal) => signal.direction === "REQUEST") ?? null;
  const response = signals.find((signal) => signal.direction === "RESPONSE") ?? null;
  const statements: D1PreparedStatement[] = [];

  for (const signal of signals) {
    statements.push(trackUpsert(db, event, signal, now));
    statements.push(versionUpsert(db, event, signal, now));
    statements.push(trackCurrentState(db, event, signal, now));
    statements.push(environmentStateUpsert(db, event, signal, now));
    const contentType = contentTypeUpsert(db, event, signal, now);
    if (contentType) statements.push(contentType);
  }

  statements.push(db.prepare(`
    UPDATE catalog_ingestion_events
    SET request_schema_version_id = ?,
        response_schema_version_id = ?,
        request_schema_new_version = CASE
          WHEN ? IS NULL THEN 0
          WHEN (SELECT introduced_by_event_id FROM catalog_schema_versions WHERE schema_version_id = ?) = event_id THEN 1
          ELSE 0 END,
        response_schema_new_version = CASE
          WHEN ? IS NULL THEN 0
          WHEN (SELECT introduced_by_event_id FROM catalog_schema_versions WHERE schema_version_id = ?) = event_id THEN 1
          ELSE 0 END,
        schema_consolidation_status = 'PROCESSED',
        schema_consolidation_attempts = schema_consolidation_attempts + 1,
        schema_consolidation_last_attempt_at = ?,
        schema_consolidation_processed_at = COALESCE(schema_consolidation_processed_at, ?),
        schema_consolidation_error = NULL,
        request_schema_json = NULL,
        response_schema_json = NULL,
        updated_at = ?
    WHERE event_id = ?
      AND schema_consolidation_status IN ('PENDING', 'FAILED')
  `).bind(
    request?.schemaVersionId ?? null,
    response?.schemaVersionId ?? null,
    request?.schemaVersionId ?? null,
    request?.schemaVersionId ?? null,
    response?.schemaVersionId ?? null,
    response?.schemaVersionId ?? null,
    now,
    now,
    now,
    event.eventId,
  ));

  await db.batch(statements);

  return {
    requestSchemaVersionId: request?.schemaVersionId ?? null,
    responseSchemaVersionId: response?.schemaVersionId ?? null,
  };
}

export async function processPendingSchemaConsolidationBatch(
  db: D1Database,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const pending = await listPendingSchemaConsolidationEvents(db, limit);
  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await processSchemaConsolidation(db, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markSchemaConsolidationFailure(db, event.eventId, error);
      console.error("[QAgent Catalog] schema consolidation failed", event.eventId, error);
    }
  }

  return { processed, failed };
}
