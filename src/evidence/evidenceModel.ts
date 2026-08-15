export const EVIDENCE_MODEL_VERSION = "evidence-v1" as const;
export const EVIDENCE_KIND = "NETWORK_OBSERVATION" as const;

export type EvidenceOutcomeClass =
  | "NETWORK_FAILURE"
  | "NO_STATUS"
  | "HTTP_1XX"
  | "HTTP_2XX"
  | "HTTP_3XX"
  | "HTTP_4XX"
  | "HTTP_5XX";

export interface EvidenceFingerprintInput {
  eventId: string;
  schemaVersion: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  normalizedEventId: string;
  normalizedEndpointId: string;
  observationSessionId: string;
  batchId: string;
  method: string;
  scheme: string;
  host: string;
  normalizedPath: string;
  observedAt: string;
  statusCode: number | null;
  networkFailure: boolean;
  originRelation: string;
  latencyMs: number;
  resourceType: string;
  requestContentType: string | null;
  responseContentType: string | null;
  requestSchemaHash: string | null;
  responseSchemaHash: string | null;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function deriveEvidenceOutcomeClass(
  statusCode: number | null,
  networkFailure: boolean,
): EvidenceOutcomeClass {
  if (networkFailure) return "NETWORK_FAILURE";
  if (statusCode === null) return "NO_STATUS";
  if (statusCode >= 100 && statusCode <= 199) return "HTTP_1XX";
  if (statusCode >= 200 && statusCode <= 299) return "HTTP_2XX";
  if (statusCode >= 300 && statusCode <= 399) return "HTTP_3XX";
  if (statusCode >= 400 && statusCode <= 499) return "HTTP_4XX";
  if (statusCode >= 500 && statusCode <= 599) return "HTTP_5XX";
  throw new Error("invalid_evidence_status_code");
}

export async function evidenceIdFor(
  organizationId: string,
  projectId: string,
  eventId: string,
): Promise<string> {
  const hash = await sha256Hex([
    EVIDENCE_MODEL_VERSION,
    organizationId,
    projectId,
    eventId,
  ].join("\u001f"));
  return `cev_${hash.slice(0, 40)}`;
}

export function canonicalEvidenceFingerprintPayload(input: EvidenceFingerprintInput): string {
  // Deliberately excludes mutable knowledge links (service_id, endpoint_id, schema_version_id).
  // The fingerprint represents the immutable, safe fact received from the Processing Plane.
  return JSON.stringify({
    evidenceModelVersion: EVIDENCE_MODEL_VERSION,
    evidenceKind: EVIDENCE_KIND,
    eventId: input.eventId,
    schemaVersion: input.schemaVersion,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    normalizedEventId: input.normalizedEventId,
    normalizedEndpointId: input.normalizedEndpointId,
    observationSessionId: input.observationSessionId,
    batchId: input.batchId,
    method: input.method,
    scheme: input.scheme,
    host: input.host,
    normalizedPath: input.normalizedPath,
    observedAt: input.observedAt,
    statusCode: input.statusCode,
    networkFailure: input.networkFailure,
    originRelation: input.originRelation,
    latencyMs: input.latencyMs,
    resourceType: input.resourceType,
    requestContentType: input.requestContentType,
    responseContentType: input.responseContentType,
    requestSchemaHash: input.requestSchemaHash,
    responseSchemaHash: input.responseSchemaHash,
  });
}

export async function evidenceFingerprintFor(input: EvidenceFingerprintInput): Promise<string> {
  const hash = await sha256Hex(canonicalEvidenceFingerprintPayload(input));
  return `evf_${hash}`;
}
