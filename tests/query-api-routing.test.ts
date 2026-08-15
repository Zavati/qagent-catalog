import { describe, expect, it } from "vitest";
import { handleCatalogRequest } from "../src/index";
import { createCatalogQuerySignature } from "../src/query/queryAuth";

const SECRET = "query-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

function baseEnv(db: D1Database): Env {
  return {
    CATALOG_DB: db,
    ENVIRONMENT: "development",
    SERVICE_NAME: "qagent-catalog",
    FOUNDATION: "07.5.11",
    REVISION: "catalog-query-v1",
    CATALOG_QUERY_MAX_SKEW_SECONDS: "300",
    CATALOG_QUERY_HMAC_SECRET: SECRET,
  } as unknown as Env;
}

function summaryDb(): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async first() {
          return {
            service_count: 3,
            endpoint_count: 10,
            observation_count: 250,
            evidence_count: 250,
            schema_version_count: 8,
            last_seen_at: "2026-08-15T20:00:00.000Z",
          };
        },
        async all() {
          if (sql.includes("GROUP BY lifecycle_state")) return { results: [{ key: "DISCOVERED", count: 10 }] };
          if (sql.includes("discovery_confidence_level")) return { results: [{ key: "HIGH", count: 4 }] };
          if (sql.includes("GROUP BY COALESCE(classification")) return { results: [{ key: "FIRST_PARTY_API", count: 2 }] };
          return { results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe("Foundation 07.5.11 Query API routing", () => {
  it("requires signed tenant context", async () => {
    const response = await handleCatalogRequest(
      new Request("https://api.apiqagent.com/v1/catalog/projects/prj_demo/endpoints"),
      baseEnv(summaryDb()),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "QUERY_AUTH_REQUIRED" });
  });

  it("keeps the Query API read-only", async () => {
    const response = await handleCatalogRequest(
      new Request("https://api.apiqagent.com/v1/catalog/projects/prj_demo/endpoints", { method: "POST" }),
      baseEnv(summaryDb()),
    );
    expect(response.status).toBe(405);
  });

  it("returns a signed project summary", async () => {
    const url = "https://api.apiqagent.com/v1/catalog/projects/prj_demo/summary";
    const unsigned = new Request(url);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await createCatalogQuerySignature(
      SECRET,
      unsigned,
      { organizationId: "org_demo", projectId: "prj_demo" },
      timestamp,
    );
    const request = new Request(url, {
      headers: {
        "x-qagent-organization-id": "org_demo",
        "x-qagent-project-id": "prj_demo",
        "x-qagent-query-timestamp": timestamp,
        "x-qagent-query-signature": signature,
      },
    });

    const response = await handleCatalogRequest(request, baseEnv(summaryDb()));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-qagent-query-api-version")).toBe("catalog-query-v1");
    expect(await response.json()).toMatchObject({
      status: "ok",
      data: {
        serviceCount: 3,
        endpointCount: 10,
        observationCount: 250,
        lifecycle: { DISCOVERED: 10 },
        confidence: { HIGH: 4 },
      },
    });
  });
});
