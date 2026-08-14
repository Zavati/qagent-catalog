import { describe, expect, it } from "vitest";
import { normalizePublicPathname } from "../src/http/publicPath";

describe("Foundation 07.5.1 public HTTP routing", () => {
  it("keeps workers.dev health unchanged", () => {
    expect(normalizePublicPathname("/health")).toBe("/health");
  });

  it("removes the public /v1/catalog prefix", () => {
    expect(normalizePublicPathname("/v1/catalog/health")).toBe("/health");
  });

  it("normalizes the public service root", () => {
    expect(normalizePublicPathname("/v1/catalog")).toBe("/");
    expect(normalizePublicPathname("/v1/catalog/")).toBe("/");
  });

  it("does not rewrite unrelated paths", () => {
    expect(normalizePublicPathname("/v1/normalizer/health")).toBe("/v1/normalizer/health");
  });
});
