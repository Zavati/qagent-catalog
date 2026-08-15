export const CLASSIFICATION_ENGINE_VERSION = "classification-v1" as const;

export type ServiceClassification =
  | "FIRST_PARTY_API"
  | "INTEGRATION"
  | "THIRD_PARTY"
  | "ANALYTICS"
  | "OBSERVABILITY"
  | "STATIC_ASSET"
  | "UNKNOWN";

export type ClassificationSource =
  | "DETERMINISTIC"
  | "HEURISTIC"
  | "USER_CONFIRMED"
  | "AI_SUGGESTED";

export interface ClassificationReason {
  code: string;
  weight: number;
  detail: string;
}

export interface ServiceClassificationSignals {
  serviceId: string;
  observationCount: number;
  sameOriginCount: number;
  sameSiteCount: number;
  externalCount: number;
  unknownOriginCount: number;
  apiTransportCount: number;
  staticResourceCount: number;
  schemaSignalCount: number;
  jsonContentTypeCount: number;
  apiPathCount: number;
  noContentCount: number;
  knownAnalyticsCount: number;
  knownObservabilityCount: number;
  trackingPatternCount: number;
  analyticsSignatureCode: string | null;
  observabilitySignatureCode: string | null;
  hostnames: string[];
}

export interface ClassificationDecision {
  classification: ServiceClassification;
  confidence: number;
  source: ClassificationSource;
  engineVersion: typeof CLASSIFICATION_ENGINE_VERSION;
  reasons: ClassificationReason[];
  signals: ServiceClassificationSignals;
}

export interface ClassificationEventInput {
  host: string;
  normalizedPath: string;
  originRelation: "SAME_ORIGIN" | "SAME_SITE_HEURISTIC" | "EXTERNAL" | "UNKNOWN";
  resourceType: string;
  requestContentType: string | null;
  responseContentType: string | null;
  requestSchemaHash: string | null;
  responseSchemaHash: string | null;
  statusCode: number | null;
}

export interface ClassificationEventSignals {
  sameOrigin: number;
  sameSite: number;
  external: number;
  unknownOrigin: number;
  apiTransport: number;
  staticResource: number;
  schemaSignal: number;
  jsonContentType: number;
  apiPath: number;
  noContent: number;
  knownAnalytics: number;
  knownObservability: number;
  trackingPattern: number;
  analyticsSignatureCode: string | null;
  observabilitySignatureCode: string | null;
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function isJsonContentType(value: string | null): boolean {
  return !!value && value.toLowerCase().includes("json");
}

function isApiPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === "/api" || normalized.startsWith("/api/") || normalized.includes("/api/");
}

function knownSignature(host: string, path: string): {
  analyticsCode: string | null;
  observabilityCode: string | null;
} {
  const h = host.toLowerCase();
  const p = path.toLowerCase();

  if (hostMatchesSuffix(h, "google-analytics.com")) return { analyticsCode: "KNOWN_GOOGLE_ANALYTICS", observabilityCode: null };
  if (h === "px.ads.linkedin.com") return { analyticsCode: "KNOWN_LINKEDIN_ADS", observabilityCode: null };
  if (hostMatchesSuffix(h, "hotjar.io") || hostMatchesSuffix(h, "hotjar.com")) return { analyticsCode: "KNOWN_HOTJAR", observabilityCode: null };
  if (h === "in-automate.brevo.com") return { analyticsCode: "KNOWN_BREVO_AUTOMATION_TELEMETRY", observabilityCode: null };
  if (hostMatchesSuffix(h, "hscollectedforms.net")) return { analyticsCode: "KNOWN_HUBSPOT_COLLECTED_FORMS", observabilityCode: null };
  if (hostMatchesSuffix(h, "hubapi.com") && (p.includes("pixels-and-events") || p.includes("/events/") || p.includes("/analytics/"))) {
    return { analyticsCode: "KNOWN_HUBSPOT_PIXEL_EVENTS_PATH", observabilityCode: null };
  }

  if (hostMatchesSuffix(h, "sentry.io") && (p.includes("/api/") || p.includes("/envelope") || p.includes("/store"))) {
    return { analyticsCode: null, observabilityCode: "KNOWN_SENTRY_INGEST" };
  }
  if (hostMatchesSuffix(h, "browser-intake-datadoghq.com") || hostMatchesSuffix(h, "browser-intake-datadoghq.eu")) {
    return { analyticsCode: null, observabilityCode: "KNOWN_DATADOG_BROWSER_INGEST" };
  }
  if (hostMatchesSuffix(h, "bam.nr-data.net")) return { analyticsCode: null, observabilityCode: "KNOWN_NEW_RELIC_INGEST" };

  return { analyticsCode: null, observabilityCode: null };
}

function genericTrackingPattern(host: string, path: string): boolean {
  const h = host.toLowerCase();
  const p = path.toLowerCase();
  return /(analytics|tracking|telemetry|pixel|ads\.)/.test(h)
    || ["/collect", "/beacon", "/track", "/tracking", "/pixel", "/pixels", "/attribution", "/telemetry"]
      .some((fragment) => p.includes(fragment));
}

export function deriveClassificationEventSignals(input: ClassificationEventInput): ClassificationEventSignals {
  const resourceType = input.resourceType.toLowerCase();
  const signature = knownSignature(input.host, input.normalizedPath);
  return {
    sameOrigin: input.originRelation === "SAME_ORIGIN" ? 1 : 0,
    sameSite: input.originRelation === "SAME_SITE_HEURISTIC" ? 1 : 0,
    external: input.originRelation === "EXTERNAL" ? 1 : 0,
    unknownOrigin: input.originRelation === "UNKNOWN" ? 1 : 0,
    apiTransport: resourceType === "fetch" || resourceType === "xhr" ? 1 : 0,
    staticResource: ["script", "stylesheet", "style", "image", "font", "media", "manifest"].includes(resourceType) ? 1 : 0,
    schemaSignal: input.requestSchemaHash || input.responseSchemaHash ? 1 : 0,
    jsonContentType: isJsonContentType(input.requestContentType) || isJsonContentType(input.responseContentType) ? 1 : 0,
    apiPath: isApiPath(input.normalizedPath) ? 1 : 0,
    noContent: input.statusCode === 204 ? 1 : 0,
    knownAnalytics: signature.analyticsCode ? 1 : 0,
    knownObservability: signature.observabilityCode ? 1 : 0,
    trackingPattern: genericTrackingPattern(input.host, input.normalizedPath) ? 1 : 0,
    analyticsSignatureCode: signature.analyticsCode,
    observabilitySignatureCode: signature.observabilityCode,
  };
}

function ratio(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, count / total));
}

function boundedConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function reason(code: string, weight: number, detail: string): ClassificationReason {
  return { code, weight, detail };
}

export function classifyService(signals: ServiceClassificationSignals): ClassificationDecision {
  const total = signals.observationCount;
  if (total <= 0) {
    return {
      classification: "UNKNOWN",
      confidence: 0,
      source: "HEURISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons: [reason("NO_OBSERVATIONS", 0, "No catalog observations are available for this service.")],
      signals,
    };
  }

  if (signals.knownAnalyticsCount > 0 && signals.knownObservabilityCount > 0) {
    return {
      classification: "UNKNOWN",
      confidence: 50,
      source: "DETERMINISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons: [reason(
        "CONFLICTING_DETERMINISTIC_SIGNATURES",
        50,
        "Both analytics and observability signatures were observed; automatic classification is intentionally withheld.",
      )],
      signals,
    };
  }

  if (signals.knownAnalyticsCount > 0) {
    return {
      classification: "ANALYTICS",
      confidence: 99,
      source: "DETERMINISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons: [reason(
        signals.analyticsSignatureCode ?? "KNOWN_ANALYTICS_SIGNATURE",
        99,
        `Known analytics/marketing telemetry signature observed in ${signals.knownAnalyticsCount}/${total} observations.`,
      )],
      signals,
    };
  }

  if (signals.knownObservabilityCount > 0) {
    return {
      classification: "OBSERVABILITY",
      confidence: 99,
      source: "DETERMINISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons: [reason(
        signals.observabilitySignatureCode ?? "KNOWN_OBSERVABILITY_SIGNATURE",
        99,
        `Known runtime/error telemetry signature observed in ${signals.knownObservabilityCount}/${total} observations.`,
      )],
      signals,
    };
  }

  const sameOriginRatio = ratio(signals.sameOriginCount, total);
  const firstPartyOriginRatio = ratio(signals.sameOriginCount + signals.sameSiteCount, total);
  const externalRatio = ratio(signals.externalCount, total);
  const apiTransportRatio = ratio(signals.apiTransportCount, total);
  const staticRatio = ratio(signals.staticResourceCount, total);
  const structuredRatio = ratio(signals.schemaSignalCount + signals.jsonContentTypeCount, total * 2);
  const apiPathRatio = ratio(signals.apiPathCount, total);

  if (staticRatio >= 0.8 && apiTransportRatio < 0.25) {
    const reasons = [reason("STATIC_RESOURCE_DOMINANT", 70, `${signals.staticResourceCount}/${total} observations are static resource types.`)];
    let confidence = 82;
    if (externalRatio >= 0.8) {
      confidence += 6;
      reasons.push(reason("EXTERNAL_DOMINANT", 6, `${signals.externalCount}/${total} observations are external.`));
    }
    if (signals.schemaSignalCount === 0 && signals.jsonContentTypeCount === 0) {
      confidence += 5;
      reasons.push(reason("NO_STRUCTURED_API_SIGNAL", 5, "No inferred schema or JSON content-type signal was observed."));
    }
    return {
      classification: "STATIC_ASSET",
      confidence: boundedConfidence(confidence),
      source: "HEURISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons,
      signals,
    };
  }

  if (firstPartyOriginRatio >= 0.8 && apiTransportRatio >= 0.5) {
    const reasons: ClassificationReason[] = [];
    let confidence = 78;
    if (sameOriginRatio >= 0.8) {
      confidence += 10;
      reasons.push(reason("SAME_ORIGIN_DOMINANT", 10, `${signals.sameOriginCount}/${total} observations are SAME_ORIGIN.`));
    } else {
      confidence += 4;
      reasons.push(reason("SAME_SITE_DOMINANT", 4, `${signals.sameOriginCount + signals.sameSiteCount}/${total} observations are same-origin or same-site.`));
    }
    confidence += 8;
    reasons.push(reason("API_TRANSPORT_DOMINANT", 8, `${signals.apiTransportCount}/${total} observations use fetch/xhr.`));
    if (signals.schemaSignalCount > 0 || signals.jsonContentTypeCount > 0) {
      confidence += 4;
      reasons.push(reason("STRUCTURED_API_SIGNAL", 4, "Inferred schema and/or JSON content-type evidence was observed."));
    }
    if (apiPathRatio > 0) {
      confidence += 2;
      reasons.push(reason("API_PATH_SIGNAL", 2, `${signals.apiPathCount}/${total} observations use an API-shaped path.`));
    }
    return {
      classification: "FIRST_PARTY_API",
      confidence: boundedConfidence(confidence),
      source: "HEURISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons,
      signals,
    };
  }

  if (externalRatio >= 0.8 && signals.trackingPatternCount > 0) {
    const reasons = [
      reason("EXTERNAL_DOMINANT", 25, `${signals.externalCount}/${total} observations are external.`),
      reason("TRACKING_SIGNATURE", 55, `Generic tracking/analytics pattern observed in ${signals.trackingPatternCount}/${total} observations.`),
    ];
    let confidence = 82;
    if (signals.noContentCount > 0) {
      confidence += 4;
      reasons.push(reason("NO_CONTENT_RESPONSE_SIGNAL", 4, `${signals.noContentCount}/${total} observations returned HTTP 204.`));
    }
    return {
      classification: "ANALYTICS",
      confidence: boundedConfidence(confidence),
      source: "HEURISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons,
      signals,
    };
  }

  if (externalRatio >= 0.8 && apiTransportRatio >= 0.5 && (structuredRatio > 0 || apiPathRatio > 0)) {
    const reasons = [
      reason("EXTERNAL_DOMINANT", 35, `${signals.externalCount}/${total} observations are external.`),
      reason("API_TRANSPORT_DOMINANT", 25, `${signals.apiTransportCount}/${total} observations use fetch/xhr.`),
    ];
    let confidence = 76;
    if (signals.schemaSignalCount > 0 || signals.jsonContentTypeCount > 0) {
      confidence += 9;
      reasons.push(reason("STRUCTURED_API_SIGNAL", 9, "Inferred schema and/or JSON content-type evidence was observed."));
    }
    if (apiPathRatio > 0) {
      confidence += 5;
      reasons.push(reason("API_PATH_SIGNAL", 5, `${signals.apiPathCount}/${total} observations use an API-shaped path.`));
    }
    return {
      classification: "INTEGRATION",
      confidence: boundedConfidence(confidence),
      source: "HEURISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons,
      signals,
    };
  }

  if (externalRatio >= 0.8) {
    return {
      classification: "THIRD_PARTY",
      confidence: boundedConfidence(65 + Math.min(15, total)),
      source: "HEURISTIC",
      engineVersion: CLASSIFICATION_ENGINE_VERSION,
      reasons: [
        reason("EXTERNAL_DOMINANT", 55, `${signals.externalCount}/${total} observations are external.`),
        reason("INSUFFICIENT_API_SEMANTICS", 10, "Evidence is insufficient to classify this external service as an integration or telemetry service."),
      ],
      signals,
    };
  }

  return {
    classification: "UNKNOWN",
    confidence: boundedConfidence(25 + Math.min(20, total)),
    source: "HEURISTIC",
    engineVersion: CLASSIFICATION_ENGINE_VERSION,
    reasons: [reason("MIXED_OR_WEAK_SIGNALS", 25, "Observed signals are mixed or too weak for a safer automatic classification.")],
    signals,
  };
}
