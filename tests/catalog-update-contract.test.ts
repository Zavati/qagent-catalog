import { describe, expect, it } from "vitest";
import { isCatalogUpdateMessage } from "../src/contracts/catalogUpdate";

function validEvent(): Record<string, unknown> {
  return {
    schemaVersion: "qagent.catalog-update.v1",
    eventId: "cat_evt_0123456789abcdef0123456789abcdef01234567",
    emittedAt: "2026-08-14T21:00:00.000Z",
    context: { organizationId: "org_1", projectId: "prj_1", environmentId: "env_1" },
    source: {
      normalizedEventId: "evt_1",
      normalizedEndpointId: "nep_1",
      observationSessionId: "obs_1",
      batchId: "batch_1",
    },
    endpoint: { method: "GET", scheme: "https", host: "api.example.com", normalizedPath: "/users/{id}" },
    observation: {
      observedAt: "2026-08-14T20:59:59.000Z",
      statusCode: 200,
      networkFailure: false,
      originRelation: "SAME_SITE_HEURISTIC",
      latencyMs: 123,
      resourceType: "fetch",
      requestContentType: null,
      responseContentType: "application/json",
    },
    schemas: {
      request: null,
      response: { hash: "sch_0123456789abcdef0123456789abcdef01234567", schema: { type: "object", properties: { id: { type: "integer" } } } },
    },
  };
}

describe("Foundation 07.5.2 catalog update contract", () => {
  it("accepts the versioned derived event", () => {
    expect(isCatalogUpdateMessage(validEvent())).toBe(true);
  });

  it("rejects incompatible versions", () => {
    const event = validEvent();
    event.schemaVersion = "qagent.catalog-update.v2";
    expect(isCatalogUpdateMessage(event)).toBe(false);
  });

  it("rejects unexpected raw fields instead of silently extending v1", () => {
    const event = validEvent();
    event.rawResponseBody = "must-never-cross-this-boundary";
    expect(isCatalogUpdateMessage(event)).toBe(false);
  });

  it("rejects raw or malformed schema signals", () => {
    const event = validEvent();
    (event.schemas as Record<string, unknown>).response = { hash: "bad", schema: { type: "object" } };
    expect(isCatalogUpdateMessage(event)).toBe(false);
  });
});
