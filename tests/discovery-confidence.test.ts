import { describe, expect, it } from "vitest";
import {
  DISCOVERY_CONFIDENCE_VERSION,
  calculateDiscoveryConfidence,
  type DiscoveryConfidenceSignals,
} from "../src/confidence/discoveryConfidence";

function base(overrides: Partial<DiscoveryConfidenceSignals> = {}): DiscoveryConfidenceSignals {
  return {
    endpointId: "cep_test",
    method: "GET",
    normalizedPath: "/api/users/{id}",
    classification: "FIRST_PARTY_API",
    classificationConfidence: 95,
    classificationSource: "HEURISTIC",
    observationCount: 12,
    sessionCount: 4,
    environmentCount: 2,
    informationalCount: 0,
    successCount: 10,
    redirectCount: 0,
    clientErrorCount: 2,
    serverErrorCount: 0,
    networkFailureCount: 0,
    noStatusCount: 0,
    firstSeenAt: "2026-08-13T10:00:00.000Z",
    lastSeenAt: "2026-08-15T10:00:00.000Z",
    schemaTrackCount: 2,
    stableSchemaTrackCount: 2,
    schemaVersionCount: 2,
    maxSchemaVersionsPerTrack: 1,
    schemaObservationCount: 20,
    ...overrides,
  };
}

describe("Foundation 07.5.9 Discovery Confidence", () => {
  it("assigns HIGH confidence to repeated stable first-party API evidence", () => {
    const result = calculateDiscoveryConfidence(base());
    expect(result.engineVersion).toBe(DISCOVERY_CONFIDENCE_VERSION);
    expect(result.level).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.reasons.map((reason) => reason.code)).toContain("FIRST_PARTY_SERVICE");
    expect(result.reasons.map((reason) => reason.code)).toContain("STABLE_SCHEMA");
  });

  it("keeps analytics low even when volume is high", () => {
    const result = calculateDiscoveryConfidence(base({
      classification: "ANALYTICS",
      classificationConfidence: 99,
      observationCount: 200,
      sessionCount: 10,
      environmentCount: 1,
      schemaTrackCount: 0,
      stableSchemaTrackCount: 0,
      schemaVersionCount: 0,
      maxSchemaVersionsPerTrack: 0,
      schemaObservationCount: 0,
      normalizedPath: "/collect",
    }));
    expect(["VERY_LOW", "LOW"]).toContain(result.level);
    expect(result.reasons.map((reason) => reason.code)).toContain("ANALYTICS_PENALTY");
  });

  it("penalizes one-off unknown discoveries without inventing certainty", () => {
    const result = calculateDiscoveryConfidence(base({
      classification: "UNKNOWN",
      classificationConfidence: 45,
      observationCount: 1,
      sessionCount: 1,
      environmentCount: 1,
      successCount: 1,
      clientErrorCount: 0,
      schemaTrackCount: 0,
      stableSchemaTrackCount: 0,
      schemaVersionCount: 0,
      maxSchemaVersionsPerTrack: 0,
      schemaObservationCount: 0,
      firstSeenAt: "2026-08-15T10:00:00.000Z",
      lastSeenAt: "2026-08-15T10:00:00.000Z",
      normalizedPath: "/dashboard",
    }));
    expect(result.level).toBe("VERY_LOW");
    expect(result.reasons.map((reason) => reason.code)).toContain("ONE_OFF_PENALTY");
    expect(result.reasons.map((reason) => reason.code)).toContain("UNKNOWN_SERVICE_PENALTY");
  });

  it("treats functional external integrations as viable discoveries when evidence is strong", () => {
    const result = calculateDiscoveryConfidence(base({
      classification: "INTEGRATION",
      classificationConfidence: 90,
      method: "POST",
      observationCount: 25,
      sessionCount: 6,
      environmentCount: 2,
    }));
    expect(result.level).toBe("HIGH");
    expect(result.reasons.map((reason) => reason.code)).toContain("INTEGRATION_SERVICE");
    expect(result.reasons.map((reason) => reason.code)).toContain("API_MUTATION_METHOD");
  });

  it("exposes score contributions rather than a magic number", () => {
    const result = calculateDiscoveryConfidence(base());
    const total = result.reasons.reduce((sum, reason) => sum + reason.delta, 0);
    expect(result.score).toBe(Math.max(0, Math.min(100, Math.round(total))));
    expect(result.signals).toMatchObject({
      observationCount: 12,
      sessionCount: 4,
      environmentCount: 2,
      classification: "FIRST_PARTY_API",
    });
  });
});
