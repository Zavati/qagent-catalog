import { describe, expect, it } from "vitest";
import {
  deriveObservedHostIdentity,
  serviceHostIdFor,
  serviceIdFor,
} from "../src/serviceIdentity/identity";

describe("Foundation 07.5.3 service identity", () => {
  it("uses hostname as a conservative logical service seed", () => {
    expect(deriveObservedHostIdentity("HTTPS", "API.Example.COM:443")).toMatchObject({
      scheme: "https",
      authority: "api.example.com",
      hostname: "api.example.com",
      port: null,
      serviceKey: "host:api.example.com",
      displayName: "api.example.com",
    });
  });

  it("keeps a physical alternate port without changing the logical service key", () => {
    const binding = deriveObservedHostIdentity("https", "api.example.com:8443");
    expect(binding.serviceKey).toBe("host:api.example.com");
    expect(binding.authority).toBe("api.example.com:8443");
    expect(binding.port).toBe("8443");
  });

  it("does not silently merge different hostnames", () => {
    expect(deriveObservedHostIdentity("https", "dev-api.example.com").serviceKey)
      .not.toBe(deriveObservedHostIdentity("https", "api.example.com").serviceKey);
  });

  it("produces deterministic tenant-aware service ids", async () => {
    const first = await serviceIdFor("org_1", "prj_1", "host:api.example.com");
    const repeated = await serviceIdFor("org_1", "prj_1", "host:api.example.com");
    const anotherProject = await serviceIdFor("org_1", "prj_2", "host:api.example.com");

    expect(first).toMatch(/^svc_[0-9a-f]{40}$/);
    expect(repeated).toBe(first);
    expect(anotherProject).not.toBe(first);
  });

  it("produces environment-aware physical host binding ids", async () => {
    const dev = await serviceHostIdFor("org_1", "prj_1", "env_dev", "https", "api.example.com");
    const prod = await serviceHostIdFor("org_1", "prj_1", "env_prod", "https", "api.example.com");

    expect(dev).toMatch(/^svh_[0-9a-f]{40}$/);
    expect(prod).not.toBe(dev);
  });
});
