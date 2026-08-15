# QAgent Foundation 07.5.6 — Schema Consolidation & Versioning

## Goal

Turn Normalizer structural schema signals into durable, versioned endpoint contracts without copying raw payloads.

## Contract tracks

Schemas are isolated by logical endpoint and contract channel:

- `REQUEST`
- `RESPONSE + HTTP status code` (`HTTP:200`, `HTTP:400`, `HTTP:422`, etc.)

A structural hash already observed in the same track reuses the same immutable schema version. A new structural hash creates the next version number.

## Version semantics

`version_number` is immutable and assigned on first Catalog discovery (`STRUCTURAL_HASH_FIRST_DISCOVERY`). `first_seen_at` and `last_seen_at` preserve actual observation chronology even when older facts are replayed later.

## Environment state

`catalog_schema_environment_state` stores the most recently observed schema version per environment. This supports future DEV/STG/PROD contract-drift detection while preserving one logical endpoint.

## Storage efficiency

After successful consolidation, `request_schema_json` and `response_schema_json` are cleared from `catalog_ingestion_events`. The event retains hashes and version references; the structure itself is stored once in `catalog_schema_versions`.

## Security

Only inferred structure is stored. No raw request/response body is introduced. Before consolidation, Catalog recomputes the canonical structural hash and rejects mismatches.
