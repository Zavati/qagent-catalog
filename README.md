# qagent-catalog

QAgent **Knowledge Layer**.

Foundation 07.5 converts safe, deterministic facts produced by the Processing Plane into durable API knowledge.

## Current scope — 07.5.10

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
- incremental endpoint Frequency & Operational Signals (`operational-signals-v1`);
- exact distinct session/environment presence;
- per-environment endpoint operational aggregates;
- derived success/error rates and latency averages;
- deterministic/explainable endpoint Discovery Confidence (`discovery-confidence-v1`);
- confidence levels/reasons built from classification, frequency, sessions, environments, schemas and HTTP evidence;
- stale-input recomputation without scanning the Evidence Ledger;
- Queue consumer;
- five-minute bounded recovery sweep;
- durable Catalog Lifecycle (`catalog-lifecycle-v1`);
- append-only endpoint lifecycle history;
- optimistic lifecycle revisions for future QA Curation;
- protection against automatic overwrite of USER decisions;
- lifecycle read models that surface new evidence after a manual/system decision;
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
  "foundation": "07.5.10",
  "revision": "catalog-lifecycle-v1",
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
Frequency & Operational Signals
  ↓
Classification Signal Aggregation
  ↓
Explainable Service Classification
  ↓
Discovery Confidence
  ↓
Catalog Lifecycle
```

## Evidence model

`catalog_ingestion_events` is promoted to the Evidence Ledger after its safe fact has the required Knowledge Layer references. This avoids creating a second full copy of every observed network event.

Read models:

```text
catalog_evidence_v1
catalog_schema_evidence_v1
```

Evidence stores no raw body. The fingerprint covers immutable safe facts and excludes mutable Service/Endpoint links so future curation does not rewrite historical evidence identity.

## Operational signals

The Evidence Ledger feeds incremental, idempotent endpoint aggregates. Read models:

```text
catalog_endpoint_operational_summary_v1
catalog_endpoint_environment_operational_summary_v1
```

The current v1 stores exact counts and latency sum/min/max; average is derived. Percentiles remain a future evolution rather than being approximated silently.

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

Query API, Console integration, QA Curation, AI Test Design and Runner remain outside 07.5.10.

## Discovery Confidence

Foundation 07.5.9 calculates endpoint-level confidence from durable aggregate knowledge rather than raw observation scans.

Read model:

```text
catalog_endpoint_discovery_confidence_v1
```

The score is deterministic and stores its positive/negative reason contributions and the input signal snapshot. Service `classification_confidence` and endpoint `discovery_confidence_score` are intentionally different concepts.


## Catalog Lifecycle

Foundation 07.5.10 separates automatic discovery from governance decisions. New endpoints start as `DISCOVERED / AUTO`, while future authenticated curation can move them through:

```text
DISCOVERED
CONFIRMED
IGNORED
DEPRECATED
```

Current lifecycle state is stored on `catalog_endpoints` for fast reads, while every transition is append-only in:

```text
catalog_endpoint_lifecycle_events
```

Read models:

```text
catalog_endpoint_lifecycle_v1
catalog_endpoint_lifecycle_history_v1
```

A USER decision is never silently reset by ingestion, confidence recomputation or future SYSTEM processing. New evidence continues to accumulate even for IGNORED/DEPRECATED endpoints and can be surfaced as new evidence since the last lifecycle decision. Public mutation is intentionally deferred to Foundation 07.5.13 QA Curation.
