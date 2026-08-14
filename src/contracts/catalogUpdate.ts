export const CATALOG_UPDATE_SCHEMA_VERSION = "qagent.catalog-update.v1" as const;

export type OriginRelation = "SAME_ORIGIN" | "SAME_SITE_HEURISTIC" | "EXTERNAL" | "UNKNOWN";

export type InferredSchema = {
  type: string | string[];
  properties?: Record<string, InferredSchema>;
  items?: InferredSchema;
  format?: string;
  "x-qagent-partial"?: boolean;
};

export interface CatalogSchemaSignal {
  hash: string;
  schema: InferredSchema;
}

export interface CatalogUpdateMessageV1 {
  schemaVersion: typeof CATALOG_UPDATE_SCHEMA_VERSION;
  eventId: string;
  emittedAt: string;
  context: {
    organizationId: string;
    projectId: string;
    environmentId: string;
  };
  source: {
    normalizedEventId: string;
    normalizedEndpointId: string;
    observationSessionId: string;
    batchId: string;
  };
  endpoint: {
    method: string;
    scheme: string;
    host: string;
    normalizedPath: string;
  };
  observation: {
    observedAt: string;
    statusCode: number | null;
    networkFailure: boolean;
    originRelation: OriginRelation;
    latencyMs: number;
    resourceType: string;
    requestContentType: string | null;
    responseContentType: string | null;
  };
  schemas: {
    request: CatalogSchemaSignal | null;
    response: CatalogSchemaSignal | null;
  };
}

const ORIGIN_RELATIONS = new Set<OriginRelation>([
  "SAME_ORIGIN",
  "SAME_SITE_HEURISTIC",
  "EXTERNAL",
  "UNKNOWN",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function isNonEmptyString(value: unknown, max = 2048): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isNullableString(value: unknown, max = 512): value is string | null {
  return value === null || (typeof value === "string" && value.length <= max);
}

function isSchema(value: unknown, depth = 0): value is InferredSchema {
  if (!isRecord(value) || depth > 8) return false;
  if (!hasOnlyKeys(value, ["type", "properties", "items", "format", "x-qagent-partial"])) return false;
  const type = value.type;
  if (!(typeof type === "string" || (Array.isArray(type) && type.every((item) => typeof item === "string")))) return false;
  if (value.format !== undefined && typeof value.format !== "string") return false;
  if (value["x-qagent-partial"] !== undefined && typeof value["x-qagent-partial"] !== "boolean") return false;
  if (value.properties !== undefined) {
    if (!isRecord(value.properties)) return false;
    const entries = Object.entries(value.properties);
    if (entries.length > 64 || entries.some(([key, child]) => key.length > 256 || !isSchema(child, depth + 1))) return false;
  }
  if (value.items !== undefined && !isSchema(value.items, depth + 1)) return false;
  return true;
}

function isSchemaSignal(value: unknown): value is CatalogSchemaSignal | null {
  if (value === null) return true;
  return isRecord(value)
    && hasOnlyKeys(value, ["hash", "schema"])
    && isNonEmptyString(value.hash, 64)
    && value.hash.startsWith("sch_")
    && isSchema(value.schema);
}

export function isCatalogUpdateMessage(value: unknown): value is CatalogUpdateMessageV1 {
  if (!isRecord(value) || value.schemaVersion !== CATALOG_UPDATE_SCHEMA_VERSION) return false;
  if (!hasOnlyKeys(value, ["schemaVersion", "eventId", "emittedAt", "context", "source", "endpoint", "observation", "schemas"])) return false;
  if (!isNonEmptyString(value.eventId, 96) || !value.eventId.startsWith("cat_evt_") || !isNonEmptyString(value.emittedAt, 64)) return false;
  if (!isRecord(value.context) || !hasOnlyKeys(value.context, ["organizationId", "projectId", "environmentId"]) || !isNonEmptyString(value.context.organizationId, 128) || !isNonEmptyString(value.context.projectId, 128) || !isNonEmptyString(value.context.environmentId, 128)) return false;
  if (!isRecord(value.source) || !hasOnlyKeys(value.source, ["normalizedEventId", "normalizedEndpointId", "observationSessionId", "batchId"]) || !isNonEmptyString(value.source.normalizedEventId, 160) || !isNonEmptyString(value.source.normalizedEndpointId, 160) || !isNonEmptyString(value.source.observationSessionId, 160) || !isNonEmptyString(value.source.batchId, 160)) return false;
  if (!isRecord(value.endpoint) || !hasOnlyKeys(value.endpoint, ["method", "scheme", "host", "normalizedPath"]) || !isNonEmptyString(value.endpoint.method, 32) || !isNonEmptyString(value.endpoint.scheme, 16) || !isNonEmptyString(value.endpoint.host, 512) || !isNonEmptyString(value.endpoint.normalizedPath, 4096)) return false;
  if (!isRecord(value.observation) || !hasOnlyKeys(value.observation, ["observedAt", "statusCode", "networkFailure", "originRelation", "latencyMs", "resourceType", "requestContentType", "responseContentType"]) || !isNonEmptyString(value.observation.observedAt, 64)) return false;
  if (value.observation.statusCode !== null && !(Number.isInteger(value.observation.statusCode) && Number(value.observation.statusCode) >= 100 && Number(value.observation.statusCode) <= 599)) return false;
  if (typeof value.observation.networkFailure !== "boolean") return false;
  if (!ORIGIN_RELATIONS.has(value.observation.originRelation as OriginRelation)) return false;
  if (!(typeof value.observation.latencyMs === "number" && Number.isFinite(value.observation.latencyMs) && value.observation.latencyMs >= 0)) return false;
  if (!isNonEmptyString(value.observation.resourceType, 64)) return false;
  if (!isNullableString(value.observation.requestContentType, 128) || !isNullableString(value.observation.responseContentType, 128)) return false;
  if (!isRecord(value.schemas) || !hasOnlyKeys(value.schemas, ["request", "response"]) || !isSchemaSignal(value.schemas.request) || !isSchemaSignal(value.schemas.response)) return false;
  return true;
}
