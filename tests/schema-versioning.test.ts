import { describe, expect, it } from "vitest";
import {
  assertStructuralSchemaHash,
  canonicalSchemaJson,
  normalizeSchemaContentType,
  schemaEnvironmentStateIdFor,
  schemaStatusKey,
  schemaStructureStats,
  schemaTrackIdFor,
  schemaVersionIdFor,
  structuralSchemaHash,
} from "../src/schema/schemaVersioning";

describe("Foundation 07.5.6 schema consolidation and versioning", () => {
  it("uses canonical structural hashing independent of property order", async () => {
    const a = { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } };
    const b = { type: "object", properties: { name: { type: "string" }, id: { type: "integer" } } };
    expect(canonicalSchemaJson(a)).toBe(canonicalSchemaJson(b));
    expect(await structuralSchemaHash(a)).toBe(await structuralSchemaHash(b));
  });

  it("rejects a structural hash that does not match the stored schema", async () => {
    const schema = { type: "object", properties: { id: { type: "integer" } } };
    await expect(assertStructuralSchemaHash(schema, "sch_0000000000000000000000000000000000000000"))
      .rejects.toThrow("schema_hash_mismatch");
  });

  it("creates independent tracks for request and each response status", async () => {
    expect(schemaStatusKey("REQUEST", null)).toBe("REQUEST");
    expect(schemaStatusKey("RESPONSE", 200)).toBe("HTTP:200");
    expect(schemaStatusKey("RESPONSE", 422)).toBe("HTTP:422");
    expect(() => schemaStatusKey("RESPONSE", null)).toThrow("response_schema_without_valid_status_code");

    const request = await schemaTrackIdFor("org_1", "prj_1", "cep_1", "REQUEST", "REQUEST");
    const response200 = await schemaTrackIdFor("org_1", "prj_1", "cep_1", "RESPONSE", "HTTP:200");
    const response422 = await schemaTrackIdFor("org_1", "prj_1", "cep_1", "RESPONSE", "HTTP:422");
    expect(new Set([request, response200, response422]).size).toBe(3);
  });

  it("keeps schema version and environment state identities deterministic", async () => {
    const track = await schemaTrackIdFor("org_1", "prj_1", "cep_1", "RESPONSE", "HTTP:200");
    const v1 = await schemaVersionIdFor(track, "sch_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const repeated = await schemaVersionIdFor(track, "sch_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const v2 = await schemaVersionIdFor(track, "sch_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const dev = await schemaEnvironmentStateIdFor(track, "env_dev");
    const prod = await schemaEnvironmentStateIdFor(track, "env_prod");
    expect(v1).toMatch(/^csv_[0-9a-f]{40}$/);
    expect(repeated).toBe(v1);
    expect(v2).not.toBe(v1);
    expect(dev).toMatch(/^cse_[0-9a-f]{40}$/);
    expect(prod).not.toBe(dev);
  });

  it("normalizes content types and records schema complexity without values", () => {
    expect(normalizeSchemaContentType("Application/JSON; charset=UTF-8")).toBe("application/json");
    const stats = schemaStructureStats({
      type: "object",
      properties: {
        user: {
          type: "object",
          "x-qagent-partial": true,
          properties: { id: { type: "integer" } },
        },
      },
    });
    expect(stats).toEqual({ nodeCount: 3, propertyCount: 2, maxDepth: 2, isPartial: true });
  });
});
