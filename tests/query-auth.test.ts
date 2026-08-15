import { describe, expect, it } from "vitest";
import {
  authorizeCatalogQuery,
  canonicalizeQuery,
  CatalogQueryAuthError,
  createCatalogQuerySignature,
} from "../src/query/queryAuth";

const SECRET = "query-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

function env(): Env {
  return {
    CATALOG_DB: {} as D1Database,
    ENVIRONMENT: "development",
    SERVICE_NAME: "qagent-catalog",
    FOUNDATION: "07.5.11",
    REVISION: "catalog-query-v1",
    CATALOG_QUERY_MAX_SKEW_SECONDS: "300",
    CATALOG_QUERY_HMAC_SECRET: SECRET,
  } as unknown as Env;
}

describe("Foundation 07.5.11 query authorization", () => {
  it("canonicalizes query parameters deterministically", () => {
    const a = new URLSearchParams("method=GET&classification=FIRST_PARTY_API&q=%2Fapi");
    const b = new URLSearchParams("q=%2Fapi&classification=FIRST_PARTY_API&method=GET");
    expect(canonicalizeQuery(a)).toBe(canonicalizeQuery(b));
  });

  it("accepts a valid signed tenant context", async () => {
    const timestamp = "1786842000";
    const request = new Request("https://api.apiqagent.com/v1/catalog/projects/prj_demo/endpoints?limit=50&method=GET");
    const signature = await createCatalogQuerySignature(
      SECRET,
      request,
      { organizationId: "org_demo", projectId: "prj_demo" },
      timestamp,
    );
    const signed = new Request(request, {
      headers: {
        "x-qagent-organization-id": "org_demo",
        "x-qagent-project-id": "prj_demo",
        "x-qagent-query-timestamp": timestamp,
        "x-qagent-query-signature": signature,
      },
    });

    await expect(authorizeCatalogQuery(signed, env(), "prj_demo", 1786842000_000)).resolves.toEqual({
      organizationId: "org_demo",
      projectId: "prj_demo",
    });
  });

  it("rejects query tampering after signing", async () => {
    const timestamp = "1786842000";
    const original = new Request("https://api.apiqagent.com/v1/catalog/projects/prj_demo/endpoints?limit=50");
    const signature = await createCatalogQuerySignature(
      SECRET,
      original,
      { organizationId: "org_demo", projectId: "prj_demo" },
      timestamp,
    );
    const tampered = new Request("https://api.apiqagent.com/v1/catalog/projects/prj_demo/endpoints?limit=100", {
      headers: {
        "x-qagent-organization-id": "org_demo",
        "x-qagent-project-id": "prj_demo",
        "x-qagent-query-timestamp": timestamp,
        "x-qagent-query-signature": signature,
      },
    });

    await expect(authorizeCatalogQuery(tampered, env(), "prj_demo", 1786842000_000)).rejects.toMatchObject({
      status: 401,
      code: "INVALID_QUERY_SIGNATURE",
    } satisfies Partial<CatalogQueryAuthError>);
  });

  it("rejects a signed project that differs from the route", async () => {
    const timestamp = "1786842000";
    const request = new Request("https://api.apiqagent.com/v1/catalog/projects/prj_other/endpoints");
    const signature = await createCatalogQuerySignature(
      SECRET,
      request,
      { organizationId: "org_demo", projectId: "prj_demo" },
      timestamp,
    );
    const signed = new Request(request, {
      headers: {
        "x-qagent-organization-id": "org_demo",
        "x-qagent-project-id": "prj_demo",
        "x-qagent-query-timestamp": timestamp,
        "x-qagent-query-signature": signature,
      },
    });

    await expect(authorizeCatalogQuery(signed, env(), "prj_other", 1786842000_000)).rejects.toMatchObject({
      status: 403,
      code: "PROJECT_SCOPE_MISMATCH",
    } satisfies Partial<CatalogQueryAuthError>);
  });
});
