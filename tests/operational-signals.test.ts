import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_SIGNAL_VERSION,
  categorizedObservationCount,
  deriveOperationalContribution,
} from "../src/operational/operationalSignals";

describe("Foundation 07.5.8 Frequency & Operational Signals", () => {
  it("keeps outcome buckets mutually exclusive", () => {
    const outcomes = [
      "HTTP_1XX",
      "HTTP_2XX",
      "HTTP_3XX",
      "HTTP_4XX",
      "HTTP_5XX",
      "NETWORK_FAILURE",
      "NO_STATUS",
    ] as const;

    for (const outcome of outcomes) {
      expect(categorizedObservationCount(deriveOperationalContribution(outcome))).toBe(1);
    }
  });

  it("uses 2xx as success and does not hide transport failures", () => {
    expect(deriveOperationalContribution("HTTP_2XX")).toMatchObject({
      successCount: 1,
      clientErrorCount: 0,
      serverErrorCount: 0,
      networkFailureCount: 0,
    });
    expect(deriveOperationalContribution("HTTP_4XX")).toMatchObject({
      successCount: 0,
      clientErrorCount: 1,
    });
    expect(deriveOperationalContribution("HTTP_5XX")).toMatchObject({
      successCount: 0,
      serverErrorCount: 1,
    });
    expect(deriveOperationalContribution("NETWORK_FAILURE")).toMatchObject({
      successCount: 0,
      networkFailureCount: 1,
    });
  });

  it("pins the aggregate contract version", () => {
    expect(OPERATIONAL_SIGNAL_VERSION).toBe("operational-signals-v1");
  });
});
