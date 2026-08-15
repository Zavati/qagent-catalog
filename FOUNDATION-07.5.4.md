# Foundation 07.5.4 — Stable Logical Endpoint Identity

## Objective

Materialize stable logical endpoint identity after Service Identity is resolved.

Identity v1:

```text
organizationId
+ projectId
+ serviceId
+ HTTP method
+ normalizedPath
```

The identity deliberately excludes Environment, scheme, physical host, Observation Session, batch and the Normalizer `endpoint_id`.

Logical IDs use `cep_*`. Physical endpoint presence is separate in `catalog_endpoint_bindings` and uses `ceb_*`.

## New entities

- `catalog_endpoints`: stable logical endpoint knowledge.
- `catalog_endpoint_bindings`: physical Service Host / Environment presence for the logical endpoint.

## Recovery

Existing 07.5.3 events receive endpoint identity status `PENDING` through migration defaults. Queue processing and the five-minute recovery sweep process them automatically.

## Non-goals

This phase does not implement classification, schema versioning, evidence model, frequency/risk, lifecycle, Query API or AI Test Design.
