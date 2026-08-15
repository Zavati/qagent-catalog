# QAgent Foundation 07.5.11 — Query API

## Objective

Expose the Knowledge Layer through a stable, read-only, tenant-aware HTTP API so the Console never queries D1 directly.

## Boundary

```text
Console
  ↓
Gateway / Control Plane
  ↓ signed tenant context
qagent-catalog Query API
  ↓
D1 read models
```

The Catalog does not own Organization/Project membership. The Gateway remains the authority and signs the tenant scope using `CATALOG_QUERY_HMAC_SECRET`.

## Security contract

Every Query API request except `/health` requires:

- `X-QAgent-Organization-Id`
- `X-QAgent-Project-Id`
- `X-QAgent-Query-Timestamp`
- `X-QAgent-Query-Signature`

HMAC payload v1:

```text
qagent.catalog-query.v1
<METHOD>
<PATH>
<CANONICAL_QUERY>
<ORGANIZATION_ID>
<PROJECT_ID>
<TIMESTAMP>
```

The signature is HMAC-SHA256 encoded as lowercase hex. Timestamp skew defaults to 300 seconds. Query parameters are part of the signature, so filters cannot be altered after signing.

The HMAC secret is a Worker secret and must never be committed or exposed to the browser.

## Endpoints

```http
GET /v1/catalog/projects/:projectId/summary
GET /v1/catalog/projects/:projectId/services
GET /v1/catalog/projects/:projectId/endpoints
GET /v1/catalog/endpoints/:endpointId
GET /v1/catalog/endpoints/:endpointId/evidence
GET /v1/catalog/endpoints/:endpointId/schemas
GET /v1/catalog/endpoints/:endpointId/lifecycle-history
```

## Pagination

Services, endpoints, evidence and lifecycle history use opaque keyset cursors. Offset pagination is intentionally avoided.

## Filters

### Services

- `classification`
- `environmentId`
- `q`
- `limit`
- `cursor`

### Endpoints

- `serviceId`
- `environmentId`
- `method`
- `classification`
- `confidenceLevel`
- `lifecycleState`
- `minConfidence`
- `lastSeenAfter`
- `q`
- `limit`
- `cursor`

### Evidence

- `environmentId`
- `outcomeClass`
- `statusCode`
- `limit`
- `cursor`

### Schemas

- `versionsPerTrack` (1..50, default 20)

## Read models

Migration `0011_query_api.sql` creates:

- `catalog_query_services_v1`
- `catalog_query_endpoints_v1`

Existing read models remain authoritative for operational/environment details, evidence, schemas and lifecycle history.

## Non-goals

07.5.11 does not implement:

- lifecycle mutation;
- service rename;
- classification override;
- tags or notes;
- browser credentials;
- AI Test Design;
- Runner execution.

Writes remain reserved for 07.5.13 — QA Curation.
