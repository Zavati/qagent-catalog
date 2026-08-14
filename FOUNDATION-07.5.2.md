# Foundation 07.5.2 — Catalog Ingestion Contract v1

## Objective

Create the durable asynchronous boundary from `qagent-normalizer` to `qagent-catalog` before introducing Service or Logical Endpoint domain tables.

```text
Observation -> Normalizer -> qagent-catalog-updates-dev -> Catalog durable inbox
```

## Contract

Schema version: `qagent.catalog-update.v1`.

The event contains only derived/sanitized facts:

- tenant context: organization/project/environment;
- Normalizer source IDs;
- method, scheme, host and normalized path;
- status/network/origin/latency/resource signals;
- content types;
- inferred structural request/response schemas plus canonical structural hashes.

It does **not** contain:

- raw request body;
- raw response body;
- `safeUrl`;
- query-string values;
- page URL;
- ClientKey, qps, qog or qos tokens.

## Idempotency

`eventId` is deterministic from `schemaVersion + organization + project + environment + normalizedEventId`.

The Catalog inbox has both:

- `PRIMARY KEY(event_id)`;
- a tenant-scoped unique source-event index over `(organization_id, project_id, environment_id, normalized_event_id)`.

Duplicate queue delivery is therefore harmless.

## Delivery semantics

The Normalizer persists its local derived event before publishing the Catalog update. If Catalog publication fails, the source normalization message is retried. A retry may publish already-delivered Catalog events; the Catalog inbox absorbs duplicates idempotently.

## Important boundary

07.5.2 does **not** create logical endpoint or service identity. Accepted events remain `PENDING` in `catalog_ingestion_events`. 07.5.3 will consume these durable facts to build Service Identity & Host Mapping.
