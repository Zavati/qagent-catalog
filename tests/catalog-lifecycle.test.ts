import { describe, expect, it } from "vitest";
import {
  CATALOG_LIFECYCLE_VERSION,
  catalogLifecycleEventIdFor,
  planLifecycleTransition,
  type EndpointLifecycleSnapshot,
} from "../src/lifecycle/catalogLifecycle";

function current(overrides: Partial<EndpointLifecycleSnapshot> = {}): EndpointLifecycleSnapshot {
  return {
    endpointId: "cep_test",
    state: "DISCOVERED",
    source: "AUTO",
    revision: 1,
    actorId: null,
    reason: "INITIAL_DISCOVERY",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("Foundation 07.5.10 Catalog Lifecycle", () => {
  it("confirms a discovered endpoint with an explicit user decision", () => {
    const plan = planLifecycleTransition(current(), {
      targetState: "CONFIRMED",
      source: "USER",
      actorId: "usr_qa_1",
      expectedRevision: 1,
    });
    expect(CATALOG_LIFECYCLE_VERSION).toBe("catalog-lifecycle-v1");
    expect(plan).toMatchObject({
      changed: true,
      fromState: "DISCOVERED",
      toState: "CONFIRMED",
      currentRevision: 1,
      nextRevision: 2,
      actorId: "usr_qa_1",
    });
  });

  it("requires a reason when ignoring or deprecating knowledge", () => {
    expect(() => planLifecycleTransition(current(), {
      targetState: "IGNORED",
      source: "USER",
      actorId: "usr_qa_1",
      expectedRevision: 1,
    })).toThrow("catalog_lifecycle_reason_required");
  });

  it("protects an explicit user decision from system overwrite", () => {
    expect(() => planLifecycleTransition(current({
      state: "CONFIRMED",
      source: "USER",
      revision: 2,
      actorId: "usr_qa_1",
    }), {
      targetState: "DEPRECATED",
      source: "SYSTEM",
      reason: "STALE_POLICY",
      expectedRevision: 2,
    })).toThrow("catalog_lifecycle_user_override_protected");
  });

  it("allows a user to restore an ignored endpoint without losing history", () => {
    const plan = planLifecycleTransition(current({
      state: "IGNORED",
      source: "USER",
      revision: 4,
      actorId: "usr_qa_1",
      reason: "analytics noise",
    }), {
      targetState: "DISCOVERED",
      source: "USER",
      actorId: "usr_qa_2",
      reason: "new evidence requires review",
      expectedRevision: 4,
    });
    expect(plan.nextRevision).toBe(5);
    expect(plan.toState).toBe("DISCOVERED");
  });

  it("rejects stale revisions for future optimistic-concurrency APIs", () => {
    expect(() => planLifecycleTransition(current({ revision: 3 }), {
      targetState: "CONFIRMED",
      source: "USER",
      actorId: "usr_qa_1",
      expectedRevision: 2,
    })).toThrow("catalog_lifecycle_revision_conflict");
  });

  it("creates deterministic audit event ids for idempotent retries", async () => {
    const a = await catalogLifecycleEventIdFor(
      "cep_test", 2, "CONFIRMED", "USER", "usr_qa_1", null,
    );
    const b = await catalogLifecycleEventIdFor(
      "cep_test", 2, "CONFIRMED", "USER", "usr_qa_1", null,
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^cle_[a-f0-9]{40}$/);
  });
});
