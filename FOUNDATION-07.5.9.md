# Foundation 07.5.9 — Discovery Confidence

## Goal

Produce a deterministic, explainable confidence score for every logical endpoint that has operational evidence.

Discovery Confidence answers:

> How strongly can QAgent treat this logical endpoint as a real, stable and QA-relevant discovery?

It is deliberately different from `classification_confidence`, which answers how confident QAgent is that a **Service category** is correct.

## Output

Each `catalog_endpoints` row can now expose:

```text
discovery_confidence_score        0..100
discovery_confidence_level        VERY_LOW | LOW | MEDIUM | HIGH
discovery_confidence_version      discovery-confidence-v1
discovery_confidence_reasons_json
discovery_confidence_signals_json
discovery_confidence_status       PENDING | PROCESSED | FAILED
```

Levels:

```text
HIGH       75-100
MEDIUM     50-74
LOW        25-49
VERY_LOW    0-24
```

## Inputs

The v1 engine only consumes durable Knowledge Layer facts:

- observation count;
- distinct session count;
- distinct environment count;
- Service classification + classification confidence;
- request/response schema presence and structural stability;
- HTTP response evidence;
- network/no-status evidence;
- normalized path shape;
- HTTP method semantics;
- first/last observed timestamps.

It does not read raw payloads and does not rescan the Evidence Ledger.

## Explainability

The score is additive and every contribution is stored as a reason:

```json
{
  "code": "MULTI_SESSION",
  "delta": 12,
  "detail": "Seen in 3 distinct sessions."
}
```

Positive and negative contributions are kept. The final total is clamped to `0..100`.

Important penalties include:

- one-off observation;
- unknown service;
- third-party service;
- analytics;
- observability;
- static assets;
- no HTTP response evidence;
- excessive schema churn.

## Recalculation model

Confidence is not recalculated by scanning all historical facts.

The scheduled/Queue sweep identifies endpoints whose upstream inputs changed since the last calculation by comparing:

- `catalog_endpoint_operational_signals.updated_at`;
- `catalog_services.updated_at`;
- latest `catalog_endpoint_schema_tracks.updated_at`.

Only stale/new/failed endpoints are recalculated.

This means cost is bounded by endpoint count, not observation history size.

## Important semantics

High traffic alone does not imply high Discovery Confidence.

For example, a deterministic Analytics Service remains heavily penalized even with thousands of observations. This keeps the score aligned to the primary functional API Catalog rather than merely measuring certainty that network traffic exists.

Conversely, an `INTEGRATION` endpoint may reach HIGH confidence when repeated sessions, schemas and HTTP evidence show it is a stable functional dependency.

## No AI

Foundation 07.5.9 uses deterministic rules only.

AI does not produce or modify Discovery Confidence in this Foundation.

## Read model

```text
catalog_endpoint_discovery_confidence_v1
```

This combines Endpoint, Service classification, operational signals, schema summary and confidence output for the future tenant-aware Query API.
