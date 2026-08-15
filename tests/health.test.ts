import { describe, expect, it } from "vitest";
import { catalogHealth } from "../src/health";
import { handleCatalogRequest } from "../src/index";

function env(): Env {
  return {
    CATALOG_DB: {} as D1Database,
    ENVIRONMENT: "development",
    SERVICE_NAME: "qagent-catalog",
    FOUNDATION: "07.5.8",
    REVISION: "operational-signals-v1",
  } as Env;
}

describe("Foundation 07.5.8 health", () => {
  it("exposes the Knowledge Layer identity", () => {
    expect(catalogHealth(env())).toEqual({
      status: "ok",
      service: "qagent-catalog",
      foundation: "07.5.8",
      revision: "operational-signals-v1",
      role: "knowledge-layer",
      environment: "development",
    });
  });

  it("supports the public /v1/catalog/health route", async () => {
    const response = await handleCatalogRequest(
      new Request("https://api.apiqagent.com/v1/catalog/health"),
      env(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "qagent-catalog",
      foundation: "07.5.8",
      revision: "operational-signals-v1",
      role: "knowledge-layer",
    });
  });

  it("rejects unsupported methods on health", async () => {
    const response = await handleCatalogRequest(
      new Request("https://api.apiqagent.com/v1/catalog/health", { method: "POST" }),
      env(),
    );
    expect(response.status).toBe(405);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await handleCatalogRequest(
      new Request("https://api.apiqagent.com/v1/catalog/unknown"),
      env(),
    );
    expect(response.status).toBe(404);
  });
});
