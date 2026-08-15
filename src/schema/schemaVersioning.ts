import type { InferredSchema } from "../contracts/catalogUpdate";

export const SCHEMA_VERSIONING_STRATEGY = "STRUCTURAL_HASH_FIRST_DISCOVERY" as const;
export const SCHEMA_VERSIONING_VERSION = "schema-versioning-v1" as const;

export type SchemaDirection = "REQUEST" | "RESPONSE";

export interface SchemaStructureStats {
  nodeCount: number;
  propertyCount: number;
  maxDepth: number;
  isPartial: boolean;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalSchemaJson(schema: InferredSchema): string {
  return JSON.stringify(canonicalize(schema));
}

export async function structuralSchemaHash(schema: InferredSchema): Promise<string> {
  return `sch_${(await sha256Hex(canonicalSchemaJson(schema))).slice(0, 40)}`;
}

export async function assertStructuralSchemaHash(schema: InferredSchema, expectedHash: string): Promise<void> {
  const actual = await structuralSchemaHash(schema);
  if (actual !== expectedHash) throw new Error("schema_hash_mismatch");
}

export function schemaStatusKey(direction: SchemaDirection, statusCode: number | null): string {
  if (direction === "REQUEST") return "REQUEST";
  if (statusCode === null || statusCode < 100 || statusCode > 599) {
    throw new Error("response_schema_without_valid_status_code");
  }
  return `HTTP:${statusCode}`;
}

export function normalizeSchemaContentType(value: string | null): string | null {
  if (!value) return null;
  const mime = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mime.length > 0 && mime.length <= 128 ? mime : null;
}

export function schemaStructureStats(schema: InferredSchema): SchemaStructureStats {
  let nodeCount = 0;
  let propertyCount = 0;
  let maxDepth = 0;
  let isPartial = false;

  function visit(node: InferredSchema, depth: number): void {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (node["x-qagent-partial"] === true) isPartial = true;

    if (node.properties) {
      const entries = Object.values(node.properties);
      propertyCount += entries.length;
      for (const child of entries) visit(child, depth + 1);
    }
    if (node.items) visit(node.items, depth + 1);
  }

  visit(schema, 0);
  return { nodeCount, propertyCount, maxDepth, isPartial };
}

export async function schemaTrackIdFor(
  organizationId: string,
  projectId: string,
  endpointId: string,
  direction: SchemaDirection,
  statusKey: string,
): Promise<string> {
  const digest = await sha256Hex([
    SCHEMA_VERSIONING_VERSION,
    organizationId,
    projectId,
    endpointId,
    direction,
    statusKey,
  ].join("\n"));
  return `cst_${digest.slice(0, 40)}`;
}

export async function schemaVersionIdFor(schemaTrackId: string, schemaHash: string): Promise<string> {
  const digest = await sha256Hex([
    SCHEMA_VERSIONING_VERSION,
    schemaTrackId,
    schemaHash,
  ].join("\n"));
  return `csv_${digest.slice(0, 40)}`;
}

export async function schemaEnvironmentStateIdFor(schemaTrackId: string, environmentId: string): Promise<string> {
  const digest = await sha256Hex([
    SCHEMA_VERSIONING_VERSION,
    schemaTrackId,
    environmentId,
  ].join("\n"));
  return `cse_${digest.slice(0, 40)}`;
}
