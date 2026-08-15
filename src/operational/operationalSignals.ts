import type { EvidenceOutcomeClass } from "../evidence/evidenceModel";

export const OPERATIONAL_SIGNAL_VERSION = "operational-signals-v1" as const;

export interface OperationalContribution {
  informationalCount: number;
  successCount: number;
  redirectCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  networkFailureCount: number;
  noStatusCount: number;
}

export function deriveOperationalContribution(
  outcome: EvidenceOutcomeClass,
): OperationalContribution {
  return {
    informationalCount: outcome === "HTTP_1XX" ? 1 : 0,
    successCount: outcome === "HTTP_2XX" ? 1 : 0,
    redirectCount: outcome === "HTTP_3XX" ? 1 : 0,
    clientErrorCount: outcome === "HTTP_4XX" ? 1 : 0,
    serverErrorCount: outcome === "HTTP_5XX" ? 1 : 0,
    networkFailureCount: outcome === "NETWORK_FAILURE" ? 1 : 0,
    noStatusCount: outcome === "NO_STATUS" ? 1 : 0,
  };
}

export function categorizedObservationCount(contribution: OperationalContribution): number {
  return contribution.informationalCount
    + contribution.successCount
    + contribution.redirectCount
    + contribution.clientErrorCount
    + contribution.serverErrorCount
    + contribution.networkFailureCount
    + contribution.noStatusCount;
}
