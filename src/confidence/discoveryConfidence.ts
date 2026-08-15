export const DISCOVERY_CONFIDENCE_VERSION = "discovery-confidence-v1" as const;

export type DiscoveryConfidenceLevel = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH";

export type ServiceClassification =
  | "FIRST_PARTY_API"
  | "INTEGRATION"
  | "THIRD_PARTY"
  | "ANALYTICS"
  | "OBSERVABILITY"
  | "STATIC_ASSET"
  | "UNKNOWN";

export interface DiscoveryConfidenceSignals {
  endpointId: string;
  method: string;
  normalizedPath: string;
  classification: ServiceClassification;
  classificationConfidence: number;
  classificationSource: string;
  observationCount: number;
  sessionCount: number;
  environmentCount: number;
  informationalCount: number;
  successCount: number;
  redirectCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  networkFailureCount: number;
  noStatusCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  schemaTrackCount: number;
  stableSchemaTrackCount: number;
  schemaVersionCount: number;
  maxSchemaVersionsPerTrack: number;
  schemaObservationCount: number;
}

export interface DiscoveryConfidenceReason {
  code: string;
  delta: number;
  detail: string;
}

export interface DiscoveryConfidenceDecision {
  score: number;
  level: DiscoveryConfidenceLevel;
  engineVersion: typeof DISCOVERY_CONFIDENCE_VERSION;
  reasons: DiscoveryConfidenceReason[];
  signals: Record<string, unknown>;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelFor(score: number): DiscoveryConfidenceLevel {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "VERY_LOW";
}

function durationHours(firstSeenAt: string, lastSeenAt: string): number {
  const first = Date.parse(firstSeenAt);
  const last = Date.parse(lastSeenAt);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return 0;
  return (last - first) / 3_600_000;
}

function looksApiShaped(path: string): boolean {
  const value = path.toLowerCase();
  return (
    value === "/api"
    || value.startsWith("/api/")
    || /^\/v\d+(?:\/|$)/.test(value)
    || /\/api\/v\d+(?:\/|$)/.test(value)
    || /\{(?:id|uuid|objectid|ulid)\}/i.test(path)
  );
}

function isMutationMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function push(reasons: DiscoveryConfidenceReason[], code: string, delta: number, detail: string): number {
  reasons.push({ code, delta, detail });
  return delta;
}

export function calculateDiscoveryConfidence(
  input: DiscoveryConfidenceSignals,
): DiscoveryConfidenceDecision {
  const reasons: DiscoveryConfidenceReason[] = [];
  let score = 0;

  if (input.observationCount >= 20) {
    score += push(reasons, "REPEATED_OBSERVATION_HIGH", 18, `Observed ${input.observationCount} times.`);
  } else if (input.observationCount >= 5) {
    score += push(reasons, "REPEATED_OBSERVATION_MEDIUM", 14, `Observed ${input.observationCount} times.`);
  } else if (input.observationCount >= 2) {
    score += push(reasons, "REPEATED_OBSERVATION", 8, `Observed ${input.observationCount} times.`);
  } else {
    score += push(reasons, "SINGLE_OBSERVATION", 2, "Only one observation exists.");
    score += push(reasons, "ONE_OFF_PENALTY", -8, "One-off discoveries are intentionally treated conservatively.");
  }

  if (input.sessionCount >= 5) {
    score += push(reasons, "MULTI_SESSION_STRONG", 18, `Seen in ${input.sessionCount} distinct sessions.`);
  } else if (input.sessionCount >= 2) {
    score += push(reasons, "MULTI_SESSION", 12, `Seen in ${input.sessionCount} distinct sessions.`);
  } else if (input.sessionCount === 1) {
    score += push(reasons, "SINGLE_SESSION", 3, "Observed in one session.");
  }

  if (input.environmentCount >= 3) {
    score += push(reasons, "MULTI_ENVIRONMENT_STRONG", 12, `Seen in ${input.environmentCount} environments.`);
  } else if (input.environmentCount >= 2) {
    score += push(reasons, "MULTI_ENVIRONMENT", 8, `Seen in ${input.environmentCount} environments.`);
  } else if (input.environmentCount === 1) {
    score += push(reasons, "SINGLE_ENVIRONMENT", 3, "Observed in one environment.");
  }

  switch (input.classification) {
    case "FIRST_PARTY_API":
      score += push(
        reasons,
        "FIRST_PARTY_SERVICE",
        input.classificationConfidence >= 80 ? 24 : 16,
        `Service classified FIRST_PARTY_API with ${input.classificationConfidence}% classification confidence.`,
      );
      break;
    case "INTEGRATION":
      score += push(
        reasons,
        "INTEGRATION_SERVICE",
        input.classificationConfidence >= 70 ? 16 : 10,
        `Service classified INTEGRATION with ${input.classificationConfidence}% classification confidence.`,
      );
      break;
    case "THIRD_PARTY":
      score += push(reasons, "THIRD_PARTY_PENALTY", -12, "Third-party traffic is less likely to be a primary QA target.");
      break;
    case "ANALYTICS":
      score += push(reasons, "ANALYTICS_PENALTY", -35, "Analytics traffic is intentionally deprioritized for API discovery.");
      break;
    case "OBSERVABILITY":
      score += push(reasons, "OBSERVABILITY_PENALTY", -30, "Observability traffic is intentionally deprioritized for API discovery.");
      break;
    case "STATIC_ASSET":
      score += push(reasons, "STATIC_ASSET_PENALTY", -40, "Static assets are not primary API discovery targets.");
      break;
    case "UNKNOWN":
      score += push(reasons, "UNKNOWN_SERVICE_PENALTY", -4, "Service classification is still UNKNOWN.");
      break;
  }

  if (input.schemaTrackCount > 0) {
    score += push(
      reasons,
      "STRUCTURED_SCHEMA_EVIDENCE",
      10,
      `${input.schemaTrackCount} request/response schema track(s) observed.`,
    );

    if (input.stableSchemaTrackCount === input.schemaTrackCount) {
      score += push(reasons, "STABLE_SCHEMA", 8, "All observed schema tracks currently have one structural version.");
    } else if (input.maxSchemaVersionsPerTrack >= 4) {
      score += push(
        reasons,
        "SCHEMA_CHURN_PENALTY",
        -4,
        `At least one schema track has ${input.maxSchemaVersionsPerTrack} structural versions.`,
      );
    }
  }

  const httpEvidenceCount =
    input.informationalCount
    + input.successCount
    + input.redirectCount
    + input.clientErrorCount
    + input.serverErrorCount;

  if (httpEvidenceCount > 0) {
    score += push(reasons, "HTTP_RESPONSE_EVIDENCE", 7, `${httpEvidenceCount} observation(s) produced an HTTP status.`);
  } else if (input.observationCount > 0 && input.networkFailureCount + input.noStatusCount === input.observationCount) {
    score += push(reasons, "NO_HTTP_RESPONSE_PENALTY", -8, "No observation produced an HTTP response status.");
  }

  if (isMutationMethod(input.method)) {
    score += push(reasons, "API_MUTATION_METHOD", 5, `${input.method.toUpperCase()} is a strong application/API interaction signal.`);
  }

  if (looksApiShaped(input.normalizedPath)) {
    score += push(reasons, "API_SHAPED_PATH", 4, `Path ${input.normalizedPath} has API-oriented structure.`);
  }

  const spanHours = durationHours(input.firstSeenAt, input.lastSeenAt);
  if (spanHours >= 24) {
    score += push(reasons, "PERSISTENT_DISCOVERY", 8, `Observed across ${Math.floor(spanHours / 24)}+ day(s).`);
  } else if (spanHours >= 1) {
    score += push(reasons, "PERSISTENT_DISCOVERY", 5, `Observed across ${spanHours.toFixed(1)} hour(s).`);
  } else if (spanHours > 0) {
    score += push(reasons, "REPEATED_OVER_TIME", 2, "Observed at distinct times within the same hour.");
  }

  const finalScore = clampScore(score);
  const level = levelFor(finalScore);

  return {
    score: finalScore,
    level,
    engineVersion: DISCOVERY_CONFIDENCE_VERSION,
    reasons,
    signals: {
      observationCount: input.observationCount,
      sessionCount: input.sessionCount,
      environmentCount: input.environmentCount,
      classification: input.classification,
      classificationConfidence: input.classificationConfidence,
      classificationSource: input.classificationSource,
      schemaTrackCount: input.schemaTrackCount,
      stableSchemaTrackCount: input.stableSchemaTrackCount,
      schemaVersionCount: input.schemaVersionCount,
      maxSchemaVersionsPerTrack: input.maxSchemaVersionsPerTrack,
      schemaObservationCount: input.schemaObservationCount,
      httpEvidenceCount,
      networkFailureCount: input.networkFailureCount,
      noStatusCount: input.noStatusCount,
      firstSeenAt: input.firstSeenAt,
      lastSeenAt: input.lastSeenAt,
      spanHours: Number(spanHours.toFixed(2)),
      mutationMethod: isMutationMethod(input.method),
      apiShapedPath: looksApiShaped(input.normalizedPath),
    },
  };
}
