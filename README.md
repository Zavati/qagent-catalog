# qagent-catalog

QAgent **Knowledge Layer**.

Foundation 07.5 converts safe, deterministic facts produced by the Processing Plane into durable API knowledge.

## Current scope — 07.5.5

The Catalog currently provides:

- Cloudflare Worker + D1;
- durable `qagent.catalog-update.v1` ingestion inbox;
- conservative Service Identity (`service-identity-v1`);
- environment-aware Service Host Mapping;
- stable logical Endpoint Identity (`logical-endpoint-v1`);
- physical endpoint bindings separated from logical endpoint identity;
- explainable Service Classification (`classification-v1`);
- incremental/idempotent classification signal aggregation;
- Queue consumer;
- five-minute recovery sweep;
- health endpoint.

Classification categories:

```text
FIRST_PARTY_API
INTEGRATION
THIRD_PARTY
ANALYTICS
OBSERVABILITY
STATIC_ASSET
UNKNOWN
```

Automatic decisions record category confidence, source, reason codes and the aggregate signals used to reach the decision. `classification_confidence` is not Discovery Confidence.

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

```http
GET /health
GET /v1/catalog/health
```

Expected payload for this snapshot:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.5",
  "revision": "classification-engine-v1",
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
  ↓
Classification Signal Aggregation
  ↓
Explainable Service Classification
```

## Architectural invariant

```text
Observation knows what happened.
Normalizer knows what the fact means structurally.
Catalog knows what we believe exists in the system.
```

Schema versioning, Evidence Model, operational frequency signals, Discovery Confidence, lifecycle, Query API, QA Curation, AI Test Design and Runner remain outside 07.5.5.
