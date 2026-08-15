export const CATALOG_LIFECYCLE_VERSION = "catalog-lifecycle-v1" as const;

export const CATALOG_LIFECYCLE_STATES = [
  "DISCOVERED",
  "CONFIRMED",
  "IGNORED",
  "DEPRECATED",
] as const;

export const CATALOG_LIFECYCLE_SOURCES = ["AUTO", "USER", "SYSTEM"] as const;

export type CatalogLifecycleState = (typeof CATALOG_LIFECYCLE_STATES)[number];
export type CatalogLifecycleSource = (typeof CATALOG_LIFECYCLE_SOURCES)[number];

export interface EndpointLifecycleSnapshot {
  endpointId: string;
  state: CatalogLifecycleState;
  source: CatalogLifecycleSource;
  revision: number;
  actorId: string | null;
  reason: string | null;
  updatedAt: string;
}

export interface LifecycleTransitionRequest {
  targetState: CatalogLifecycleState;
  source: Exclude<CatalogLifecycleSource, "AUTO">;
  expectedRevision: number;
  actorId?: string | null;
  reason?: string | null;
}

export interface LifecycleTransitionPlan {
  changed: boolean;
  fromState: CatalogLifecycleState;
  toState: CatalogLifecycleState;
  source: Exclude<CatalogLifecycleSource, "AUTO">;
  currentRevision: number;
  nextRevision: number;
  actorId: string | null;
  reason: string | null;
}

function cleanOptional(value: string | null | undefined, maxLength: number, errorCode: string): string | null {
  if (value == null) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error(errorCode);
  return cleaned;
}

export function planLifecycleTransition(
  current: EndpointLifecycleSnapshot,
  request: LifecycleTransitionRequest,
): LifecycleTransitionPlan {
  if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 1) {
    throw new Error("catalog_lifecycle_invalid_expected_revision");
  }
  if (current.revision !== request.expectedRevision) {
    throw new Error("catalog_lifecycle_revision_conflict");
  }

  const actorId = cleanOptional(request.actorId, 200, "catalog_lifecycle_actor_too_long");
  const reason = cleanOptional(request.reason, 1000, "catalog_lifecycle_reason_too_long");

  if (request.source === "USER" && !actorId) {
    throw new Error("catalog_lifecycle_user_actor_required");
  }

  // Automatic/system knowledge processing may never erase an explicit human decision.
  if (current.source === "USER" && request.source !== "USER") {
    throw new Error("catalog_lifecycle_user_override_protected");
  }

  if ((request.targetState === "IGNORED" || request.targetState === "DEPRECATED") && !reason) {
    throw new Error("catalog_lifecycle_reason_required");
  }

  if (request.targetState === current.state) {
    return {
      changed: false,
      fromState: current.state,
      toState: current.state,
      source: request.source,
      currentRevision: current.revision,
      nextRevision: current.revision,
      actorId,
      reason,
    };
  }

  return {
    changed: true,
    fromState: current.state,
    toState: request.targetState,
    source: request.source,
    currentRevision: current.revision,
    nextRevision: current.revision + 1,
    actorId,
    reason,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function catalogLifecycleEventIdFor(
  endpointId: string,
  revision: number,
  toState: CatalogLifecycleState,
  source: CatalogLifecycleSource,
  actorId: string | null,
  reason: string | null,
): Promise<string> {
  const digest = await sha256Hex([
    CATALOG_LIFECYCLE_VERSION,
    endpointId,
    String(revision),
    toState,
    source,
    actorId ?? "",
    reason ?? "",
  ].join("\n"));

  return `cle_${digest.slice(0, 40)}`;
}
