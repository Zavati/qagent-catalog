# qagent-catalog

QAgent **Knowledge Layer**.

Foundation 07.5 converts safe, deterministic facts produced by the Processing Plane into durable API knowledge.

## Current scope — 07.5.4

The Catalog currently provides:

- Cloudflare Worker + D1;
- durable `qagent.catalog-update.v1` ingestion inbox;
- conservative Service Identity (`service-identity-v1`);
- environment-aware Service Host Mapping;
- stable logical Endpoint Identity (`logical-endpoint-v1`);
- physical endpoint bindings separated from logical endpoint identity;
- Queue consumer;
- five-minute recovery sweep;
- health endpoint.

The logical endpoint identity is:

```text
organizationId
+ projectId
+ serviceId
+ HTTP method
+ normalizedPath
```

It deliberately excludes Environment, scheme, host, Observation Session, batch and the Normalizer endpoint id.

## Local bootstrap

```bash
npm ci
npm run check
```

## D1

```bash
npx wrangler d1 migrations apply qagent-catalog-dev --remote
```

Preserve only the real `database_id` when replacing snapshots; do not preserve an old `wrangler.toml` wholesale.

## Health

Workers.dev:

```http
GET /health
```

Public route:

```http
GET /v1/catalog/health
```

Expected payload for this snapshot:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.4",
  "revision": "logical-endpoint-identity-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## Public route

```text
api.apiqagent.com/v1/catalog/*
```

## Current knowledge pipeline

```text
Catalog Inbox
  ↓
Service Identity
  ↓
Service Host Mapping
  ↓
Stable Logical Endpoint Identity
  ↓
Endpoint Physical Binding
```

## Architectural invariant

```text
Observation knows what happened.
Normalizer knows what the fact means structurally.
Catalog knows what we believe exists in the system.
```

Classification, schema versioning, evidence, frequency/confidence, lifecycle, Query API, AI Test Design and Runner remain outside 07.5.4.
