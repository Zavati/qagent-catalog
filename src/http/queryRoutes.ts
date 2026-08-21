import { authorizeCatalogQuery, CatalogQueryAuthError } from "../query/queryAuth";
import { InvalidQueryCursorError } from "../query/queryCursor";
import {
  InvalidQueryParameterError,
  optionalEnum,
  optionalInteger,
  optionalString,
  optionalTimestamp,
  parseLimit,
} from "../query/queryParams";
import {
  DISCOVERY_CONFIDENCE_LEVELS,
  EVIDENCE_OUTCOMES,
  getCatalogEndpointDetail,
  getCatalogEndpointSchemas,
  LIFECYCLE_STATES,
  listCatalogEndpoints,
  listCatalogEvidence,
  listCatalogLifecycleHistory,
  listCatalogServices,
  queryProjectSummary,
  SERVICE_CLASSIFICATIONS,
} from "../storage/catalogQueryRepository";

const QUERY_API_VERSION = "catalog-query-v1";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-qagent-query-api-version": QUERY_API_VERSION,
    },
  });
}

function camelize(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toApiValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toApiValue);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "auth_observed") {
      output.authObserved = raw === null || raw === undefined ? null : Number(raw) === 1;
      continue;
    }
    if (key.endsWith("_json")) {
      output[camelize(key.slice(0, -5))] = parseJsonString(raw);
      continue;
    }
    const apiKey = camelize(key);
    output[apiKey] = Array.isArray(raw) || (raw && typeof raw === "object") ? toApiValue(raw) : raw;
  }
  return output;
}

function pageResponse(items: Record<string, unknown>[], nextCursor: string | null, limit: number): Response {
  return json({
    status: "ok",
    data: toApiValue(items),
    page: { limit, nextCursor, hasMore: nextCursor !== null },
  });
}

function safeSegment(value: string, name: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new InvalidQueryParameterError(name, `${name} is invalid.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(decoded)) {
    throw new InvalidQueryParameterError(name, `${name} is invalid.`);
  }
  return decoded;
}

function parseMethod(params: URLSearchParams): string | undefined {
  const method = optionalString(params, "method", 16)?.toUpperCase();
  if (method && !/^[A-Z][A-Z0-9_-]{0,15}$/.test(method)) {
    throw new InvalidQueryParameterError("method", "method is invalid.");
  }
  return method;
}

export async function handleCatalogQueryRoute(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const knownQueryPath = [
      /^\/projects\/[^/]+\/summary$/,
      /^\/projects\/[^/]+\/services$/,
      /^\/projects\/[^/]+\/endpoints$/,
      /^\/endpoints\/[^/]+$/,
      /^\/endpoints\/[^/]+\/evidence$/,
      /^\/endpoints\/[^/]+\/schemas$/,
      /^\/endpoints\/[^/]+\/lifecycle-history$/,
    ].some((pattern) => pattern.test(pathname));
    if (!knownQueryPath) return null;
    if (request.method !== "GET") {
      return json({ status: "method_not_allowed", message: "Method not allowed.", allowed: ["GET"] }, 405);
    }

    const projectSummaryMatch = pathname.match(/^\/projects\/([^/]+)\/summary$/);
    if (projectSummaryMatch) {
      const projectId = safeSegment(projectSummaryMatch[1]!, "projectId");
      const tenant = await authorizeCatalogQuery(request, env, projectId);
      const result = await queryProjectSummary(env.CATALOG_DB, tenant);
      return json({
        status: "ok",
        data: {
          serviceCount: Number(result.service_count ?? 0),
          endpointCount: Number(result.endpoint_count ?? 0),
          observationCount: Number(result.observation_count ?? 0),
          evidenceCount: Number(result.evidence_count ?? 0),
          schemaVersionCount: Number(result.schema_version_count ?? 0),
          lastSeenAt: result.last_seen_at ?? null,
          lifecycle: result.lifecycle ?? {},
          confidence: result.confidence ?? {},
          classifications: result.classifications ?? {},
        },
      });
    }

    const servicesMatch = pathname.match(/^\/projects\/([^/]+)\/services$/);
    if (servicesMatch) {
      const projectId = safeSegment(servicesMatch[1]!, "projectId");
      const tenant = await authorizeCatalogQuery(request, env, projectId);
      const limit = parseLimit(url.searchParams);
      const result = await listCatalogServices(env.CATALOG_DB, tenant, {
        classification: optionalEnum(url.searchParams, "classification", SERVICE_CLASSIFICATIONS),
        environmentId: optionalString(url.searchParams, "environmentId", 128),
        q: optionalString(url.searchParams, "q", 120),
        cursor: optionalString(url.searchParams, "cursor", 2048),
        limit,
      });
      return pageResponse(result.items, result.nextCursor, limit);
    }

    const endpointsMatch = pathname.match(/^\/projects\/([^/]+)\/endpoints$/);
    if (endpointsMatch) {
      const projectId = safeSegment(endpointsMatch[1]!, "projectId");
      const tenant = await authorizeCatalogQuery(request, env, projectId);
      const limit = parseLimit(url.searchParams);
      const result = await listCatalogEndpoints(env.CATALOG_DB, tenant, {
        serviceId: optionalString(url.searchParams, "serviceId", 128),
        environmentId: optionalString(url.searchParams, "environmentId", 128),
        method: parseMethod(url.searchParams),
        classification: optionalEnum(url.searchParams, "classification", SERVICE_CLASSIFICATIONS),
        confidenceLevel: optionalEnum(url.searchParams, "confidenceLevel", DISCOVERY_CONFIDENCE_LEVELS),
        lifecycleState: optionalEnum(url.searchParams, "lifecycleState", LIFECYCLE_STATES),
        minConfidence: optionalInteger(url.searchParams, "minConfidence", 0, 100),
        lastSeenAfter: optionalTimestamp(url.searchParams, "lastSeenAfter"),
        q: optionalString(url.searchParams, "q", 120),
        cursor: optionalString(url.searchParams, "cursor", 2048),
        limit,
      });
      return pageResponse(result.items, result.nextCursor, limit);
    }

    const endpointEvidenceMatch = pathname.match(/^\/endpoints\/([^/]+)\/evidence$/);
    if (endpointEvidenceMatch) {
      const endpointId = safeSegment(endpointEvidenceMatch[1]!, "endpointId");
      const tenant = await authorizeCatalogQuery(request, env);
      const endpoint = await getCatalogEndpointDetail(env.CATALOG_DB, tenant, endpointId);
      if (!endpoint) return json({ status: "not_found", message: "Endpoint not found." }, 404);
      const limit = parseLimit(url.searchParams);
      const result = await listCatalogEvidence(env.CATALOG_DB, tenant, endpointId, {
        environmentId: optionalString(url.searchParams, "environmentId", 128),
        outcomeClass: optionalEnum(url.searchParams, "outcomeClass", EVIDENCE_OUTCOMES),
        statusCode: optionalInteger(url.searchParams, "statusCode", 100, 599),
        cursor: optionalString(url.searchParams, "cursor", 2048),
        limit,
      });
      return pageResponse(result.items, result.nextCursor, limit);
    }

    const endpointSchemasMatch = pathname.match(/^\/endpoints\/([^/]+)\/schemas$/);
    if (endpointSchemasMatch) {
      const endpointId = safeSegment(endpointSchemasMatch[1]!, "endpointId");
      const tenant = await authorizeCatalogQuery(request, env);
      const versionsPerTrack = optionalInteger(url.searchParams, "versionsPerTrack", 1, 50) ?? 20;
      const tracks = await getCatalogEndpointSchemas(env.CATALOG_DB, tenant, endpointId, versionsPerTrack);
      if (tracks === null) return json({ status: "not_found", message: "Endpoint not found." }, 404);
      return json({
        status: "ok",
        data: {
          endpointId,
          versionsPerTrack,
          tracks: toApiValue(tracks),
        },
      });
    }

    const endpointLifecycleMatch = pathname.match(/^\/endpoints\/([^/]+)\/lifecycle-history$/);
    if (endpointLifecycleMatch) {
      const endpointId = safeSegment(endpointLifecycleMatch[1]!, "endpointId");
      const tenant = await authorizeCatalogQuery(request, env);
      const limit = parseLimit(url.searchParams);
      const result = await listCatalogLifecycleHistory(env.CATALOG_DB, tenant, endpointId, {
        cursor: optionalString(url.searchParams, "cursor", 2048),
        limit,
      });
      if (!result.exists) return json({ status: "not_found", message: "Endpoint not found." }, 404);
      return pageResponse(result.items, result.nextCursor, limit);
    }

    const endpointDetailMatch = pathname.match(/^\/endpoints\/([^/]+)$/);
    if (endpointDetailMatch) {
      const endpointId = safeSegment(endpointDetailMatch[1]!, "endpointId");
      const tenant = await authorizeCatalogQuery(request, env);
      const endpoint = await getCatalogEndpointDetail(env.CATALOG_DB, tenant, endpointId);
      if (!endpoint) return json({ status: "not_found", message: "Endpoint not found." }, 404);
      return json({ status: "ok", data: toApiValue(endpoint) });
    }

    return null;
  } catch (error) {
    if (error instanceof CatalogQueryAuthError) {
      return json({ status: "error", code: error.code, message: error.message, requestId }, error.status);
    }
    if (error instanceof InvalidQueryParameterError) {
      return json({
        status: "error",
        code: "INVALID_QUERY_PARAMETER",
        parameter: error.parameter,
        message: error.message,
        requestId,
      }, 400);
    }
    if (error instanceof InvalidQueryCursorError) {
      return json({ status: "error", code: "INVALID_CURSOR", message: error.message, requestId }, 400);
    }

    console.error(`[QAgent Catalog] query request failed requestId=${requestId}`, error);
    return json({
      status: "error",
      code: "QUERY_FAILED",
      message: "Catalog query failed.",
      requestId,
    }, 500);
  }
}
