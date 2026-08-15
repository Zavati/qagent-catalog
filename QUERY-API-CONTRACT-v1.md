# QAgent Catalog Query API — v1

## Response conventions

Successful list:

```json
{
  "status": "ok",
  "data": [],
  "page": {
    "limit": 50,
    "nextCursor": null,
    "hasMore": false
  }
}
```

Successful object:

```json
{
  "status": "ok",
  "data": {}
}
```

Error:

```json
{
  "status": "error",
  "code": "QUERY_AUTH_REQUIRED",
  "message": "Signed tenant context is required.",
  "requestId": "..."
}
```

Responses use camelCase. Structural schema JSON is returned as JSON, not as an escaped database string.

## Project summary

```http
GET /v1/catalog/projects/:projectId/summary
```

Returns service/endpoint/observation/evidence/schema counts and lifecycle/confidence/classification distributions.

## Services

```http
GET /v1/catalog/projects/:projectId/services
```

Default ordering:

1. total observations DESC;
2. last seen DESC;
3. service id ASC.

Each item includes classification, endpoint counts by lifecycle/confidence, observation counts and host/environment footprint.

## Endpoints

```http
GET /v1/catalog/projects/:projectId/endpoints
```

Default ordering:

1. Discovery Confidence DESC;
2. observation count DESC;
3. last seen DESC;
4. endpoint id ASC.

Each item includes Service classification, logical identity, operational signals, schema counts, Discovery Confidence and lifecycle.

## Endpoint detail

```http
GET /v1/catalog/endpoints/:endpointId
```

The signed `organizationId + projectId` scopes the lookup. A valid endpoint id from another tenant returns 404.

Includes environment operational summaries and physical endpoint bindings.

## Evidence

```http
GET /v1/catalog/endpoints/:endpointId/evidence
```

Returns the Evidence Ledger for the logical endpoint with opaque keyset pagination.

## Schemas

```http
GET /v1/catalog/endpoints/:endpointId/schemas
```

Returns request/response tracks, latest schema versions, environment current-state and observed content types. `versionsPerTrack` limits history returned per track without changing stored history.

## Lifecycle history

```http
GET /v1/catalog/endpoints/:endpointId/lifecycle-history
```

Read-only audit history of lifecycle transitions. Mutation is intentionally absent until 07.5.13.
