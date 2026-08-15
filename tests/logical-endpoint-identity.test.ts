import { describe, expect, it } from "vitest";
import {
  catalogEndpointBindingIdFor,
  catalogEndpointIdFor,
  deriveLogicalEndpointIdentity,
} from "../src/endpointIdentity/identity";

describe("Foundation 07.5.4 stable logical endpoint identity", () => {
  it("normalizes method but preserves the normalized path exactly", () => {
    expect(deriveLogicalEndpointIdentity(" get ", "/users/{id}/")).toEqual({
      method: "GET",
      normalizedPath: "/users/{id}/",
      endpointKey: "GET /users/{id}/",
    });
  });

  it("produces deterministic logical endpoint ids", async () => {
    const first = await catalogEndpointIdFor("org_1", "prj_1", "svc_1", "GET", "/users/{id}");
    const repeated = await catalogEndpointIdFor("org_1", "prj_1", "svc_1", "get", "/users/{id}");

    expect(first).toMatch(/^cep_[0-9a-f]{40}$/);
    expect(repeated).toBe(first);
  });

  it("separates endpoints by service, method and normalized path", async () => {
    const base = await catalogEndpointIdFor("org_1", "prj_1", "svc_1", "GET", "/users/{id}");
    const otherService = await catalogEndpointIdFor("org_1", "prj_1", "svc_2", "GET", "/users/{id}");
    const otherMethod = await catalogEndpointIdFor("org_1", "prj_1", "svc_1", "POST", "/users/{id}");
    const otherPath = await catalogEndpointIdFor("org_1", "prj_1", "svc_1", "GET", "/users");

    expect(otherService).not.toBe(base);
    expect(otherMethod).not.toBe(base);
    expect(otherPath).not.toBe(base);
  });

  it("keeps physical service-host binding separate from logical endpoint identity", async () => {
    const endpointId = await catalogEndpointIdFor("org_1", "prj_1", "svc_1", "GET", "/users/{id}");
    const dev = await catalogEndpointBindingIdFor("org_1", "prj_1", endpointId, "svh_dev");
    const prod = await catalogEndpointBindingIdFor("org_1", "prj_1", endpointId, "svh_prod");

    expect(dev).toMatch(/^ceb_[0-9a-f]{40}$/);
    expect(prod).not.toBe(dev);
  });
});
