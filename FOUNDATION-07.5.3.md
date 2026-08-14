# Foundation 07.5.3 — Service Identity & Host Mapping

## Goal

Turn durable Catalog inbox facts into the first logical Knowledge Layer entities without prematurely creating logical endpoints or classifications.

## Model

```text
catalog_ingestion_events
        ↓
Service Identity Processor
        ↓
catalog_services
        ↓
catalog_service_hosts
```

`catalog_services` represents logical service identity scoped by Organization + Project.

`catalog_service_hosts` represents physical evidence: environment + scheme + observed authority.

## Identity v1

The first algorithm is intentionally conservative:

```text
service_key = host:<normalized hostname>
```

Scheme, port and Environment are not part of the logical service seed. They remain on host bindings.

Therefore the same hostname observed in DEV/STG/PROD or through different schemes/ports can resolve to one service, while two different hostnames are **not silently merged**.

This is deliberate. Cross-host aliasing, custom domains and API Gateways are supported by the data model, but a future deterministic engine or QA curation must provide evidence before rebinding one physical host to another service.

## Automatic processing

New Queue messages are persisted idempotently and immediately processed into Service + Host Mapping.

A bounded recovery sweep runs after Queue batches and every five minutes through a Cron Trigger. This also upgrades 07.5.2 rows that already exist with `processing_status = PENDING`.

## Human curation safety

Automatic upsert never overwrites an existing host binding's `service_id`. This is intentional so a future `USER` or `SYSTEM` relink cannot be silently undone by deterministic discovery.

## Not implemented yet

- logical endpoint identity;
- API classification;
- confidence scoring;
- schema versioning;
- QA curation HTTP API;
- AI inference.
