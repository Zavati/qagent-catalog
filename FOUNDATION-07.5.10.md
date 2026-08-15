# Foundation 07.5.10 — Catalog Lifecycle

## Goal

Add durable governance to logical endpoints without allowing automatic discovery to erase human decisions.

Lifecycle is intentionally independent from Discovery Confidence:

- Discovery Confidence answers how strongly QAgent trusts the endpoint as a real/relevant discovery.
- Lifecycle records the current governance decision about that endpoint.

## States

```text
DISCOVERED
CONFIRMED
IGNORED
DEPRECATED
```

## Sources

```text
AUTO
USER
SYSTEM
```

New endpoints start as:

```text
DISCOVERED / AUTO / revision 1
```

## Invariants

1. New observations continue updating evidence, schemas, frequency, classification and confidence regardless of lifecycle state.
2. Automatic processing never resets lifecycle state.
3. A USER decision cannot be silently overwritten by AUTO or SYSTEM processing.
4. Every lifecycle transition is append-only in `catalog_endpoint_lifecycle_events`.
5. `lifecycle_revision` provides optimistic concurrency for future mutation APIs.
6. IGNORED and DEPRECATED require a reason.
7. Retry of the same planned transition can reuse a deterministic audit event id.
8. Existing endpoints are backfilled as DISCOVERED without losing current knowledge.

## Storage

Current state is denormalized on `catalog_endpoints` for cheap queries:

```text
lifecycle_state
lifecycle_source
lifecycle_version
lifecycle_revision
lifecycle_actor_id
lifecycle_reason
lifecycle_updated_at
```

History is append-only:

```text
catalog_endpoint_lifecycle_events
```

Read models:

```text
catalog_endpoint_lifecycle_v1
catalog_endpoint_lifecycle_history_v1
```

## Why no public mutation endpoint yet?

Foundation 07.5.10 creates the model and transition engine only. Tenant-aware authenticated mutation belongs to 07.5.13 QA Curation, after the 07.5.11 Query API boundary is established.

This prevents an unauthenticated/temporary write path from becoming part of the platform contract.

## Rediscovery behavior

If a user marks an endpoint IGNORED or DEPRECATED and new evidence arrives later:

- the lifecycle decision remains unchanged;
- evidence and operational signals continue accumulating;
- `has_new_evidence_since_lifecycle_change` becomes true in the lifecycle read model.

This surfaces drift without silently undoing the QA decision.
