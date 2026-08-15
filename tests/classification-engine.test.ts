import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_ENGINE_VERSION,
  classifyService,
  deriveClassificationEventSignals,
  type ServiceClassificationSignals,
} from "../src/classification/classifier";

function signals(overrides: Partial<ServiceClassificationSignals> = {}): ServiceClassificationSignals {
  return {
    serviceId: "svc_test",
    observationCount: 10,
    sameOriginCount: 0,
    sameSiteCount: 0,
    externalCount: 0,
    unknownOriginCount: 0,
    apiTransportCount: 0,
    staticResourceCount: 0,
    schemaSignalCount: 0,
    jsonContentTypeCount: 0,
    apiPathCount: 0,
    noContentCount: 0,
    knownAnalyticsCount: 0,
    knownObservabilityCount: 0,
    trackingPatternCount: 0,
    analyticsSignatureCode: null,
    observabilitySignatureCode: null,
    hostnames: [],
    ...overrides,
  };
}

describe("Foundation 07.5.5 classification engine", () => {
  it("recognizes a deterministic analytics signature", () => {
    const eventSignals = deriveClassificationEventSignals({
      host: "www.google-analytics.com",
      normalizedPath: "/g/collect",
      originRelation: "EXTERNAL",
      resourceType: "fetch",
      requestContentType: null,
      responseContentType: null,
      requestSchemaHash: null,
      responseSchemaHash: null,
      statusCode: 204,
    });

    expect(eventSignals.knownAnalytics).toBe(1);
    expect(eventSignals.analyticsSignatureCode).toBe("KNOWN_GOOGLE_ANALYTICS");

    const decision = classifyService(signals({
      observationCount: 6,
      externalCount: 6,
      apiTransportCount: 6,
      noContentCount: 6,
      knownAnalyticsCount: 6,
      trackingPatternCount: 6,
      analyticsSignatureCode: "KNOWN_GOOGLE_ANALYTICS",
      hostnames: ["www.google-analytics.com"],
    }));

    expect(decision).toMatchObject({
      classification: "ANALYTICS",
      confidence: 99,
      source: "DETERMINISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
    });
  });

  it("classifies dominant same-origin fetch/xhr traffic as first-party API", () => {
    const decision = classifyService(signals({
      observationCount: 13,
      sameOriginCount: 13,
      apiTransportCount: 13,
      schemaSignalCount: 6,
      hostnames: ["app.impulso.team"],
    }));

    expect(decision.classification).toBe("FIRST_PARTY_API");
    expect(decision.source).toBe("HEURISTIC");
    expect(decision.confidence).toBeGreaterThanOrEqual(95);
    expect(decision.reasons.map((item) => item.code)).toContain("SAME_ORIGIN_DOMINANT");
  });

  it("classifies structured external API traffic conservatively as integration", () => {
    const decision = classifyService(signals({
      observationCount: 1,
      externalCount: 1,
      apiTransportCount: 1,
      schemaSignalCount: 1,
      apiPathCount: 1,
      hostnames: ["next.impulso.app"],
    }));

    expect(decision.classification).toBe("INTEGRATION");
    expect(decision.confidence).toBeGreaterThanOrEqual(85);
    expect(decision.source).toBe("HEURISTIC");
  });

  it("keeps conflicting deterministic telemetry signatures out of an automatic category", () => {
    const decision = classifyService(signals({
      externalCount: 10,
      apiTransportCount: 10,
      knownAnalyticsCount: 2,
      knownObservabilityCount: 2,
      analyticsSignatureCode: "KNOWN_ANALYTICS_SIGNATURE",
      observabilitySignatureCode: "KNOWN_OBSERVABILITY_SIGNATURE",
    }));

    expect(decision.classification).toBe("UNKNOWN");
    expect(decision.reasons[0]?.code).toBe("CONFLICTING_DETERMINISTIC_SIGNATURES");
  });

  it("classifies dominant static resource traffic without treating an external CDN as an integration", () => {
    const decision = classifyService(signals({
      observationCount: 10,
      externalCount: 10,
      staticResourceCount: 10,
    }));

    expect(decision.classification).toBe("STATIC_ASSET");
    expect(decision.confidence).toBeGreaterThanOrEqual(90);
  });
});
