import { describe, expect, it } from "vitest";
import {
  EVIDENCE_KIND,
  EVIDENCE_MODEL_VERSION,
  canonicalEvidenceFingerprintPayload,
  deriveEvidenceOutcomeClass,
  evidenceFingerprintFor,
  evidenceIdFor,
  type EvidenceFingerprintInput,
} from "../src/evidence/evidenceModel";

function evidence(overrides: Partial<EvidenceFingerprintInput> = {}): EvidenceFingerprintInput {
  return {
    eventId: "cat_evt_123",
    schemaVersion: "qagent.catalog-update.v1",
    organizationId: "org_1",
    projectId: "prj_1",
    environmentId: "env_stg",
    normalizedEventId: "oev_1",
    normalizedEndpointId: "nep_1",
    observationSessionId: "obs_1",
    batchId: "batch_1",
    method: "GET",
    scheme: "https",
    host: "api.example.com",
    normalizedPath: "/users/{id}",
    observedAt: "2026-08-15T12:00:00.000Z",
    statusCode: 200,
    networkFailure: false,
    originRelation: "SAME_ORIGIN",
    latencyMs: 123,
    resourceType: "fetch",
    requestContentType: null,
    responseContentType: "application/json",
    requestSchemaHash: null,
    responseSchemaHash: "sch_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ...overrides,
  };
}

describe("Foundation 07.5.7 Evidence Model", () => {
  it("uses deterministic tenant-scoped evidence ids", async () => {
    const first = await evidenceIdFor("org_1", "prj_1", "cat_evt_123");
    const repeated = await evidenceIdFor("org_1", "prj_1", "cat_evt_123");
    const otherProject = await evidenceIdFor("org_1", "prj_2", "cat_evt_123");

    expect(first).toMatch(/^cev_[0-9a-f]{40}$/);
    expect(repeated).toBe(first);
    expect(otherProject).not.toBe(first);
  });

  it("classifies transport outcome without inventing success semantics", () => {
    expect(deriveEvidenceOutcomeClass(204, false)).toBe("HTTP_2XX");
    expect(deriveEvidenceOutcomeClass(302, false)).toBe("HTTP_3XX");
    expect(deriveEvidenceOutcomeClass(404, false)).toBe("HTTP_4XX");
    expect(deriveEvidenceOutcomeClass(503, false)).toBe("HTTP_5XX");
    expect(deriveEvidenceOutcomeClass(null, false)).toBe("NO_STATUS");
    expect(deriveEvidenceOutcomeClass(null, true)).toBe("NETWORK_FAILURE");
  });

  it("fingerprints only the immutable safe fact, not mutable knowledge links", async () => {
    const input = evidence();
    const fingerprint = await evidenceFingerprintFor(input);
    expect(fingerprint).toMatch(/^evf_[0-9a-f]{64}$/);
    expect(await evidenceFingerprintFor({ ...input })).toBe(fingerprint);
    expect(await evidenceFingerprintFor({ ...input, latencyMs: 124 })).not.toBe(fingerprint);

    const payload = canonicalEvidenceFingerprintPayload(input);
    expect(payload).toContain(EVIDENCE_MODEL_VERSION);
    expect(payload).toContain(EVIDENCE_KIND);
    expect(payload).not.toContain("serviceId");
    expect(payload).not.toContain("catalogEndpointId");
    expect(payload).not.toContain("schemaVersionId");
  });

  it("never includes raw request/response bodies in the fingerprint contract", () => {
    const payload = JSON.parse(canonicalEvidenceFingerprintPayload(evidence())) as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain("requestBody");
    expect(Object.keys(payload)).not.toContain("responseBody");
    expect(Object.keys(payload)).not.toContain("requestSchemaJson");
    expect(Object.keys(payload)).not.toContain("responseSchemaJson");
  });
});
