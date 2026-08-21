import { describe, expect, it } from "vitest";
import { handleCatalogRequest } from "../src/index";
import { createCatalogQuerySignature } from "../src/query/queryAuth";

const SECRET = "query-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

function db(): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async first() {
          if (sql.includes("FROM catalog_endpoints")) return { endpoint_id: "cep_auth" };
          return null;
        },
        async all() {
          if (sql.includes("FROM catalog_evidence_v1")) {
            return {
              results: [{
                evidence_id: "cev_auth",
                evidence_fingerprint: "evf_auth",
                environment_id: "env_stg",
                event_id: "cat_evt_auth",
                normalized_event_id: "oev_auth",
                normalized_endpoint_id: "nep_auth",
                observation_session_id: "obs_auth",
                batch_id: "batch_auth",
                service_id: "csvc_auth",
                service_host_id: "csh_auth",
                catalog_endpoint_id: "cep_auth",
                method: "GET",
                scheme: "https",
                host: "api.example.test",
                normalized_path: "/api/myself/settings",
                observed_at: "2026-08-21T12:00:00.000Z",
                status_code: 200,
                network_failure: 0,
                evidence_outcome_class: "HTTP_2XX",
                origin_relation: "EXTERNAL",
                latency_ms: 50,
                resource_type: "fetch",
                auth_observed: 1,
                auth_scheme: "BEARER",
                request_content_type: null,
                response_content_type: "application/json",
                request_schema_hash: null,
                request_schema_version_id: null,
                response_schema_hash: "sch_response",
                response_schema_version_id: "csv_response",
                evidence_ready_at: "2026-08-21T12:00:01.000Z",
              }],
            };
          }
          return { results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function env(): Env {
  return {
    CATALOG_DB: db(),
    ENVIRONMENT: "development",
    SERVICE_NAME: "qagent-catalog",
    FOUNDATION: "07.5.11",
    REVISION: "catalog-query-v1",
    CATALOG_QUERY_MAX_SKEW_SECONDS: "300",
    CATALOG_QUERY_HMAC_SECRET: SECRET,
  } as unknown as Env;
}

async function signedRequest(): Promise<Request> {
  const url = "https://api.apiqagent.com/v1/catalog/endpoints/cep_auth/evidence";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const unsigned = new Request(url);
  const signature = await createCatalogQuerySignature(
    SECRET,
    unsigned,
    { organizationId: "org_demo", projectId: "prj_demo" },
    timestamp,
  );
  return new Request(url, {
    headers: {
      "x-qagent-organization-id": "org_demo",
      "x-qagent-project-id": "prj_demo",
      "x-qagent-query-timestamp": timestamp,
      "x-qagent-query-signature": signature,
    },
  });
}

describe("Foundation 07.7.2-A FIX-2 Catalog Evidence auth signal", () => {
  it("exposes authObserved as a boolean and only a safe scheme enum", async () => {
    const response = await handleCatalogRequest(await signedRequest(), env());
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).toMatchObject({
      evidenceId: "cev_auth",
      authObserved: true,
      authScheme: "BEARER",
    });
    expect(JSON.stringify(body)).not.toContain("Authorization");
    expect(JSON.stringify(body)).not.toContain("must-not-enter-catalog");
  });
});
