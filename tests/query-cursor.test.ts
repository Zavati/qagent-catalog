import { describe, expect, it } from "vitest";
import { decodeQueryCursor, encodeQueryCursor, InvalidQueryCursorError } from "../src/query/queryCursor";

describe("Foundation 07.5.11 opaque cursors", () => {
  it("round-trips cursor state without exposing SQL offsets", () => {
    const cursor = encodeQueryCursor({ confidenceScore: 82, observationCount: 25, endpointId: "cep_123" });
    expect(cursor).not.toContain("cep_123");
    expect(decodeQueryCursor(cursor)).toMatchObject({
      v: 1,
      confidenceScore: 82,
      observationCount: 25,
      endpointId: "cep_123",
    });
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeQueryCursor("%%%not-a-cursor%%%"))
      .toThrow(InvalidQueryCursorError);
  });
});
