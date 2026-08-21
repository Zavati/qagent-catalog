import { decodeQueryCursor, encodeQueryCursor, InvalidQueryCursorError } from "../query/queryCursor";

export const SERVICE_CLASSIFICATIONS = [
  "FIRST_PARTY_API",
  "INTEGRATION",
  "THIRD_PARTY",
  "ANALYTICS",
  "OBSERVABILITY",
  "STATIC_ASSET",
  "UNKNOWN",
] as const;

export const DISCOVERY_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW", "VERY_LOW"] as const;
export const LIFECYCLE_STATES = ["DISCOVERED", "CONFIRMED", "IGNORED", "DEPRECATED"] as const;
export const EVIDENCE_OUTCOMES = [
  "HTTP_1XX",
  "HTTP_2XX",
  "HTTP_3XX",
  "HTTP_4XX",
  "HTTP_5XX",
  "NETWORK_FAILURE",
  "NO_STATUS",
] as const;

export interface TenantScope {
  organizationId: string;
  projectId: string;
}

export interface ServiceListFilters {
  classification?: typeof SERVICE_CLASSIFICATIONS[number];
  environmentId?: string;
  q?: string;
  limit: number;
  cursor?: string;
}

export interface EndpointListFilters {
  serviceId?: string;
  environmentId?: string;
  method?: string;
  classification?: typeof SERVICE_CLASSIFICATIONS[number];
  confidenceLevel?: typeof DISCOVERY_CONFIDENCE_LEVELS[number];
  lifecycleState?: typeof LIFECYCLE_STATES[number];
  minConfidence?: number;
  lastSeenAfter?: string;
  q?: string;
  limit: number;
  cursor?: string;
}

export interface EvidenceListFilters {
  environmentId?: string;
  outcomeClass?: typeof EVIDENCE_OUTCOMES[number];
  statusCode?: number;
  limit: number;
  cursor?: string;
}

export interface LifecycleHistoryFilters {
  limit: number;
  cursor?: string;
}

interface ServiceCursor extends Record<string, unknown> {
  observationCount: number;
  lastSeenAt: string;
  serviceId: string;
}

interface EndpointCursor extends Record<string, unknown> {
  confidenceScore: number;
  observationCount: number;
  lastSeenAt: string;
  endpointId: string;
}

interface TimeIdCursor extends Record<string, unknown> {
  timestamp: string;
  id: string;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new InvalidQueryCursorError(`Cursor ${name} is invalid.`);
  return value;
}

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidQueryCursorError(`Cursor ${name} is invalid.`);
  }
  return value;
}

function decodeServiceCursor(cursor?: string): ServiceCursor | undefined {
  if (!cursor) return undefined;
  const value = decodeQueryCursor<ServiceCursor>(cursor);
  return {
    observationCount: assertNumber(value.observationCount, "observationCount"),
    lastSeenAt: assertString(value.lastSeenAt, "lastSeenAt"),
    serviceId: assertString(value.serviceId, "serviceId"),
  };
}

function decodeEndpointCursor(cursor?: string): EndpointCursor | undefined {
  if (!cursor) return undefined;
  const value = decodeQueryCursor<EndpointCursor>(cursor);
  return {
    confidenceScore: assertNumber(value.confidenceScore, "confidenceScore"),
    observationCount: assertNumber(value.observationCount, "observationCount"),
    lastSeenAt: assertString(value.lastSeenAt, "lastSeenAt"),
    endpointId: assertString(value.endpointId, "endpointId"),
  };
}

function decodeTimeIdCursor(cursor?: string): TimeIdCursor | undefined {
  if (!cursor) return undefined;
  const value = decodeQueryCursor<TimeIdCursor>(cursor);
  return {
    timestamp: assertString(value.timestamp, "timestamp"),
    id: assertString(value.id, "id"),
  };
}

async function allRows<T extends Record<string, unknown>>(
  db: D1Database,
  sql: string,
  binds: unknown[],
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...binds).all<T>();
  return result.results ?? [];
}

export async function queryProjectSummary(db: D1Database, scope: TenantScope): Promise<Record<string, unknown>> {
  const [core, lifecycleRows, confidenceRows, classificationRows] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM catalog_services
          WHERE organization_id = ?1 AND project_id = ?2) AS service_count,
        (SELECT COUNT(*) FROM catalog_endpoints
          WHERE organization_id = ?1 AND project_id = ?2) AS endpoint_count,
        (SELECT COALESCE(SUM(observation_count), 0) FROM catalog_endpoint_operational_signals
          WHERE organization_id = ?1 AND project_id = ?2) AS observation_count,
        (SELECT COALESCE(SUM(observation_count), 0) FROM catalog_endpoint_operational_signals
          WHERE organization_id = ?1 AND project_id = ?2) AS evidence_count,
        (SELECT COUNT(*) FROM catalog_schema_versions
          WHERE organization_id = ?1 AND project_id = ?2) AS schema_version_count,
        (SELECT MAX(last_seen_at) FROM catalog_endpoint_operational_signals
          WHERE organization_id = ?1 AND project_id = ?2) AS last_seen_at
    `).bind(scope.organizationId, scope.projectId).first<Record<string, unknown>>(),
    allRows<Record<string, unknown>>(db, `
      SELECT lifecycle_state AS key, COUNT(*) AS count
      FROM catalog_endpoints
      WHERE organization_id = ? AND project_id = ?
      GROUP BY lifecycle_state
    `, [scope.organizationId, scope.projectId]),
    allRows<Record<string, unknown>>(db, `
      SELECT COALESCE(discovery_confidence_level, 'UNSCORED') AS key, COUNT(*) AS count
      FROM catalog_endpoints
      WHERE organization_id = ? AND project_id = ?
      GROUP BY COALESCE(discovery_confidence_level, 'UNSCORED')
    `, [scope.organizationId, scope.projectId]),
    allRows<Record<string, unknown>>(db, `
      SELECT COALESCE(classification, 'UNKNOWN') AS key, COUNT(*) AS count
      FROM catalog_services
      WHERE organization_id = ? AND project_id = ?
      GROUP BY COALESCE(classification, 'UNKNOWN')
    `, [scope.organizationId, scope.projectId]),
  ]);

  const toMap = (rows: Record<string, unknown>[]): Record<string, number> => Object.fromEntries(
    rows.map((row) => [String(row.key), Number(row.count ?? 0)]),
  );

  return {
    ...(core ?? {}),
    lifecycle: toMap(lifecycleRows),
    confidence: toMap(confidenceRows),
    classifications: toMap(classificationRows),
  };
}

export async function listCatalogServices(
  db: D1Database,
  scope: TenantScope,
  filters: ServiceListFilters,
): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
  const where = ["q.organization_id = ?", "q.project_id = ?"];
  const binds: unknown[] = [scope.organizationId, scope.projectId];

  if (filters.classification) {
    where.push("q.classification = ?");
    binds.push(filters.classification);
  }
  if (filters.environmentId) {
    where.push(`EXISTS (
      SELECT 1 FROM catalog_service_hosts sh
      WHERE sh.organization_id = q.organization_id
        AND sh.project_id = q.project_id
        AND sh.service_id = q.service_id
        AND sh.environment_id = ?
        AND sh.mapping_status = 'ACTIVE'
    )`);
    binds.push(filters.environmentId);
  }
  if (filters.q) {
    where.push("(LOWER(q.display_name) LIKE ? OR LOWER(q.service_key) LIKE ?)");
    const pattern = `%${filters.q.toLowerCase()}%`;
    binds.push(pattern, pattern);
  }

  const cursor = decodeServiceCursor(filters.cursor);
  if (cursor) {
    where.push(`(
      q.total_observation_count < ?
      OR (q.total_observation_count = ? AND q.last_seen_at < ?)
      OR (q.total_observation_count = ? AND q.last_seen_at = ? AND q.service_id > ?)
    )`);
    binds.push(
      cursor.observationCount,
      cursor.observationCount, cursor.lastSeenAt,
      cursor.observationCount, cursor.lastSeenAt, cursor.serviceId,
    );
  }

  binds.push(filters.limit + 1);
  const rows = await allRows<Record<string, unknown>>(db, `
    SELECT q.*
    FROM catalog_query_services_v1 q
    WHERE ${where.join(" AND ")}
    ORDER BY q.total_observation_count DESC, q.last_seen_at DESC, q.service_id ASC
    LIMIT ?
  `, binds);

  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? encodeQueryCursor({
        observationCount: Number(last.total_observation_count ?? 0),
        lastSeenAt: String(last.last_seen_at ?? ""),
        serviceId: String(last.service_id),
      })
    : null;

  return { items, nextCursor };
}

export async function listCatalogEndpoints(
  db: D1Database,
  scope: TenantScope,
  filters: EndpointListFilters,
): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
  const where = ["q.organization_id = ?", "q.project_id = ?"];
  const binds: unknown[] = [scope.organizationId, scope.projectId];

  if (filters.serviceId) {
    where.push("q.service_id = ?");
    binds.push(filters.serviceId);
  }
  if (filters.environmentId) {
    where.push(`EXISTS (
      SELECT 1 FROM catalog_endpoint_bindings eb
      WHERE eb.organization_id = q.organization_id
        AND eb.project_id = q.project_id
        AND eb.endpoint_id = q.endpoint_id
        AND eb.environment_id = ?
    )`);
    binds.push(filters.environmentId);
  }
  if (filters.method) {
    where.push("q.method = ?");
    binds.push(filters.method);
  }
  if (filters.classification) {
    where.push("q.classification = ?");
    binds.push(filters.classification);
  }
  if (filters.confidenceLevel) {
    where.push("q.discovery_confidence_level = ?");
    binds.push(filters.confidenceLevel);
  }
  if (filters.lifecycleState) {
    where.push("q.lifecycle_state = ?");
    binds.push(filters.lifecycleState);
  }
  if (filters.minConfidence !== undefined) {
    where.push("COALESCE(q.discovery_confidence_score, -1) >= ?");
    binds.push(filters.minConfidence);
  }
  if (filters.lastSeenAfter) {
    where.push("q.last_seen_at >= ?");
    binds.push(filters.lastSeenAfter);
  }
  if (filters.q) {
    where.push("(LOWER(q.normalized_path) LIKE ? OR LOWER(q.service_name) LIKE ?)");
    const pattern = `%${filters.q.toLowerCase()}%`;
    binds.push(pattern, pattern);
  }

  const cursor = decodeEndpointCursor(filters.cursor);
  if (cursor) {
    where.push(`(
      COALESCE(q.discovery_confidence_score, -1) < ?
      OR (COALESCE(q.discovery_confidence_score, -1) = ? AND q.observation_count < ?)
      OR (COALESCE(q.discovery_confidence_score, -1) = ? AND q.observation_count = ? AND q.last_seen_at < ?)
      OR (COALESCE(q.discovery_confidence_score, -1) = ? AND q.observation_count = ? AND q.last_seen_at = ? AND q.endpoint_id > ?)
    )`);
    binds.push(
      cursor.confidenceScore,
      cursor.confidenceScore, cursor.observationCount,
      cursor.confidenceScore, cursor.observationCount, cursor.lastSeenAt,
      cursor.confidenceScore, cursor.observationCount, cursor.lastSeenAt, cursor.endpointId,
    );
  }

  binds.push(filters.limit + 1);
  const rows = await allRows<Record<string, unknown>>(db, `
    SELECT q.*
    FROM catalog_query_endpoints_v1 q
    WHERE ${where.join(" AND ")}
    ORDER BY
      COALESCE(q.discovery_confidence_score, -1) DESC,
      q.observation_count DESC,
      q.last_seen_at DESC,
      q.endpoint_id ASC
    LIMIT ?
  `, binds);

  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? encodeQueryCursor({
        confidenceScore: Number(last.discovery_confidence_score ?? -1),
        observationCount: Number(last.observation_count ?? 0),
        lastSeenAt: String(last.last_seen_at ?? ""),
        endpointId: String(last.endpoint_id),
      })
    : null;

  return { items, nextCursor };
}

export async function getCatalogEndpointDetail(
  db: D1Database,
  scope: TenantScope,
  endpointId: string,
): Promise<Record<string, unknown> | null> {
  const endpoint = await db.prepare(`
    SELECT *
    FROM catalog_query_endpoints_v1
    WHERE organization_id = ? AND project_id = ? AND endpoint_id = ?
  `).bind(scope.organizationId, scope.projectId, endpointId).first<Record<string, unknown>>();
  if (!endpoint) return null;

  const [environments, bindings] = await Promise.all([
    allRows<Record<string, unknown>>(db, `
      SELECT
        environment_id,
        observation_count,
        session_count,
        informational_count,
        success_count,
        redirect_count,
        client_error_count,
        server_error_count,
        network_failure_count,
        no_status_count,
        success_rate_pct,
        latency_avg_ms,
        latency_min_ms,
        latency_max_ms,
        observations_per_session,
        first_seen_at,
        last_seen_at,
        first_evidence_id,
        last_evidence_id
      FROM catalog_endpoint_environment_operational_summary_v1
      WHERE organization_id = ? AND project_id = ? AND endpoint_id = ?
      ORDER BY environment_id ASC
    `, [scope.organizationId, scope.projectId, endpointId]),
    allRows<Record<string, unknown>>(db, `
      SELECT
        eb.endpoint_binding_id,
        eb.environment_id,
        eb.service_host_id,
        sh.scheme,
        sh.host,
        sh.hostname,
        sh.port,
        sh.host_role,
        sh.mapping_source,
        sh.mapping_status,
        eb.first_seen_at,
        eb.last_seen_at
      FROM catalog_endpoint_bindings eb
      JOIN catalog_service_hosts sh ON sh.service_host_id = eb.service_host_id
      WHERE eb.organization_id = ? AND eb.project_id = ? AND eb.endpoint_id = ?
      ORDER BY eb.environment_id ASC, sh.host ASC
    `, [scope.organizationId, scope.projectId, endpointId]),
  ]);

  return { ...endpoint, environments, bindings };
}

export async function listCatalogEvidence(
  db: D1Database,
  scope: TenantScope,
  endpointId: string,
  filters: EvidenceListFilters,
): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
  const where = [
    "ev.organization_id = ?",
    "ev.project_id = ?",
    "ev.catalog_endpoint_id = ?",
  ];
  const binds: unknown[] = [scope.organizationId, scope.projectId, endpointId];

  if (filters.environmentId) {
    where.push("ev.environment_id = ?");
    binds.push(filters.environmentId);
  }
  if (filters.outcomeClass) {
    where.push("ev.evidence_outcome_class = ?");
    binds.push(filters.outcomeClass);
  }
  if (filters.statusCode !== undefined) {
    where.push("ev.status_code = ?");
    binds.push(filters.statusCode);
  }

  const cursor = decodeTimeIdCursor(filters.cursor);
  if (cursor) {
    where.push("(ev.observed_at < ? OR (ev.observed_at = ? AND ev.evidence_id > ?))");
    binds.push(cursor.timestamp, cursor.timestamp, cursor.id);
  }

  binds.push(filters.limit + 1);
  const rows = await allRows<Record<string, unknown>>(db, `
    SELECT
      ev.evidence_id,
      ev.evidence_fingerprint,
      ev.environment_id,
      ev.event_id,
      ev.normalized_event_id,
      ev.normalized_endpoint_id,
      ev.observation_session_id,
      ev.batch_id,
      ev.service_id,
      ev.service_host_id,
      ev.catalog_endpoint_id,
      ev.method,
      ev.scheme,
      ev.host,
      ev.normalized_path,
      ev.observed_at,
      ev.status_code,
      ev.network_failure,
      ev.evidence_outcome_class,
      ev.origin_relation,
      ev.latency_ms,
      ev.resource_type,
      ev.auth_observed,
      ev.auth_scheme,
      ev.request_content_type,
      ev.response_content_type,
      ev.request_schema_hash,
      ev.request_schema_version_id,
      ev.response_schema_hash,
      ev.response_schema_version_id,
      ev.evidence_ready_at
    FROM catalog_evidence_v1 ev
    WHERE ${where.join(" AND ")}
    ORDER BY ev.observed_at DESC, ev.evidence_id ASC
    LIMIT ?
  `, binds);

  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? encodeQueryCursor({ timestamp: String(last.observed_at), id: String(last.evidence_id) })
    : null;
  return { items, nextCursor };
}

export async function getCatalogEndpointSchemas(
  db: D1Database,
  scope: TenantScope,
  endpointId: string,
  versionsPerTrack: number,
): Promise<Record<string, unknown>[] | null> {
  const exists = await db.prepare(`
    SELECT endpoint_id FROM catalog_endpoints
    WHERE organization_id = ? AND project_id = ? AND endpoint_id = ?
  `).bind(scope.organizationId, scope.projectId, endpointId).first<{ endpoint_id: string }>();
  if (!exists) return null;

  const tracks = await allRows<Record<string, unknown>>(db, `
    SELECT
      schema_track_id,
      direction,
      status_code,
      versioning_strategy,
      versioning_version,
      current_schema_version_id,
      current_schema_hash,
      current_version_number,
      current_observed_at,
      distinct_version_count,
      first_seen_at,
      last_seen_at
    FROM catalog_endpoint_schema_tracks
    WHERE organization_id = ? AND project_id = ? AND endpoint_id = ?
    ORDER BY CASE direction WHEN 'REQUEST' THEN 0 ELSE 1 END, status_code ASC
  `, [scope.organizationId, scope.projectId, endpointId]);

  const versions = await allRows<Record<string, unknown>>(db, `
    WITH ranked AS (
      SELECT
        v.*,
        ROW_NUMBER() OVER (
          PARTITION BY v.schema_track_id
          ORDER BY v.version_number DESC
        ) AS rn
      FROM catalog_schema_versions v
      WHERE v.organization_id = ? AND v.project_id = ? AND v.endpoint_id = ?
    )
    SELECT
      schema_version_id,
      schema_track_id,
      direction,
      status_code,
      version_number,
      schema_hash,
      schema_json,
      is_partial,
      node_count,
      property_count,
      max_depth,
      predecessor_schema_version_id,
      introduced_by_event_id,
      first_event_id,
      last_event_id,
      observation_count,
      first_seen_at,
      last_seen_at
    FROM ranked
    WHERE rn <= ?
    ORDER BY schema_track_id ASC, version_number DESC
  `, [scope.organizationId, scope.projectId, endpointId, versionsPerTrack]);

  const environmentStates = await allRows<Record<string, unknown>>(db, `
    SELECT
      schema_track_id,
      environment_id,
      current_schema_version_id,
      current_schema_hash,
      current_version_number,
      current_observed_at,
      observation_count,
      first_seen_at,
      last_seen_at
    FROM catalog_schema_environment_state
    WHERE organization_id = ? AND project_id = ? AND endpoint_id = ?
    ORDER BY schema_track_id ASC, environment_id ASC
  `, [scope.organizationId, scope.projectId, endpointId]);

  const contentTypes = versions.length === 0
    ? []
    : await allRows<Record<string, unknown>>(db, `
        WITH ranked AS (
          SELECT
            v.schema_version_id,
            ROW_NUMBER() OVER (
              PARTITION BY v.schema_track_id
              ORDER BY v.version_number DESC
            ) AS rn
          FROM catalog_schema_versions v
          WHERE v.organization_id = ? AND v.project_id = ? AND v.endpoint_id = ?
        ),
        selected AS (
          SELECT schema_version_id FROM ranked WHERE rn <= ?
        )
        SELECT ct.schema_version_id, ct.content_type, ct.observation_count, ct.first_seen_at, ct.last_seen_at
        FROM catalog_schema_version_content_types ct
        JOIN selected s ON s.schema_version_id = ct.schema_version_id
        ORDER BY ct.schema_version_id ASC, ct.observation_count DESC, ct.content_type ASC
      `, [scope.organizationId, scope.projectId, endpointId, versionsPerTrack]);

  const versionsByTrack = new Map<string, Record<string, unknown>[]>();
  for (const version of versions) {
    const trackId = String(version.schema_track_id);
    const list = versionsByTrack.get(trackId) ?? [];
    const versionId = String(version.schema_version_id);
    list.push({
      ...version,
      content_types: contentTypes.filter((ct) => String(ct.schema_version_id) === versionId),
    });
    versionsByTrack.set(trackId, list);
  }

  const environmentsByTrack = new Map<string, Record<string, unknown>[]>();
  for (const state of environmentStates) {
    const trackId = String(state.schema_track_id);
    const list = environmentsByTrack.get(trackId) ?? [];
    list.push(state);
    environmentsByTrack.set(trackId, list);
  }

  return tracks.map((track) => {
    const trackId = String(track.schema_track_id);
    return {
      ...track,
      versions: versionsByTrack.get(trackId) ?? [],
      environments: environmentsByTrack.get(trackId) ?? [],
      versions_truncated: Number(track.distinct_version_count ?? 0) > versionsPerTrack,
    };
  });
}

export async function listCatalogLifecycleHistory(
  db: D1Database,
  scope: TenantScope,
  endpointId: string,
  filters: LifecycleHistoryFilters,
): Promise<{ exists: boolean; items: Record<string, unknown>[]; nextCursor: string | null }> {
  const exists = await db.prepare(`
    SELECT endpoint_id FROM catalog_endpoints
    WHERE organization_id = ? AND project_id = ? AND endpoint_id = ?
  `).bind(scope.organizationId, scope.projectId, endpointId).first<{ endpoint_id: string }>();
  if (!exists) return { exists: false, items: [], nextCursor: null };

  const where = ["organization_id = ?", "project_id = ?", "endpoint_id = ?"];
  const binds: unknown[] = [scope.organizationId, scope.projectId, endpointId];
  const cursor = decodeTimeIdCursor(filters.cursor);
  if (cursor) {
    where.push("(changed_at < ? OR (changed_at = ? AND lifecycle_event_id > ?))");
    binds.push(cursor.timestamp, cursor.timestamp, cursor.id);
  }
  binds.push(filters.limit + 1);

  const rows = await allRows<Record<string, unknown>>(db, `
    SELECT
      lifecycle_event_id,
      endpoint_id,
      service_id,
      lifecycle_revision,
      from_state,
      to_state,
      source,
      actor_id,
      reason,
      changed_at,
      created_at
    FROM catalog_endpoint_lifecycle_events
    WHERE ${where.join(" AND ")}
    ORDER BY changed_at DESC, lifecycle_event_id ASC
    LIMIT ?
  `, binds);

  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? encodeQueryCursor({ timestamp: String(last.changed_at), id: String(last.lifecycle_event_id) })
    : null;
  return { exists: true, items, nextCursor };
}
