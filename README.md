# qagent-catalog

QAgent **Knowledge Layer**.

Foundation 07.5 converts safe, deterministic facts produced by the Processing Plane into durable API knowledge.

## Current scope — 07.5.7

The Catalog currently provides:

- Cloudflare Worker + D1;
- durable `qagent.catalog-update.v1` ingestion journal;
- conservative Service Identity (`service-identity-v1`);
- environment-aware Service Host Mapping;
- stable logical Endpoint Identity (`logical-endpoint-v1`);
- physical endpoint bindings separated from logical endpoint identity;
- explainable Service Classification (`classification-v1`);
- incremental/idempotent classification signal aggregation;
- schema consolidation/versioning (`schema-versioning-v1`);
- request contracts and response contracts separated by HTTP status;
- per-environment current schema state;
- durable Evidence Ledger (`evidence-v1`);
- deterministic evidence identity/fingerprint without raw payload duplication;
- endpoint/service/schema provenance views;
- Queue consumer;
- five-minute bounded recovery sweep;
- health endpoint.

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
  "foundation": "07.5.7",
  "revision": "evidence-model-v1",
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
Catalog Ingestion Journal
  ↓
Service Identity / Host Mapping
  ↓
Stable Logical Endpoint Identity
  ↓
Schema Consolidation & Versioning
  ↓
Evidence Materialization
  ↓
Classification Signal Aggregation
  ↓
Explainable Service Classification
```

## Evidence model

`catalog_ingestion_events` is promoted to the Evidence Ledger after its safe fact has the required Knowledge Layer references. This avoids creating a second full copy of every observed network event.

Read models:

```text
catalog_evidence_v1
catalog_schema_evidence_v1
```

Evidence stores no raw body. The fingerprint covers immutable safe facts and excludes mutable Service/Endpoint links so future curation does not rewrite historical evidence identity.

## SQL references

Engineering validation/diagnostic SQL is versioned under:

```text
docs/sql/
```

These SQLs are not a Console contract. Foundation 07.5.11 will expose tenant-aware Query APIs for UI consumption.

## Architectural invariant

```text
Observation knows what happened.
Normalizer knows what the fact means structurally.
Catalog knows what we believe exists in the system.
Evidence explains why we believe it.
```

Frequency & Operational Signals, Discovery Confidence, lifecycle, Query API, Console integration, QA Curation, AI Test Design and Runner remain outside 07.5.7.
