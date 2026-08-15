# Foundation 07.5.8 — Frequency & Operational Signals

## Goal

Turn the Evidence Ledger into durable, idempotent operational knowledge per logical endpoint without rescanning full history on every new observation.

## Scope

This foundation materializes:

- total observations per logical endpoint;
- exact distinct Observation Session count;
- exact distinct Environment count;
- HTTP 1xx / 2xx / 3xx / 4xx / 5xx counts;
- network-failure and no-status counts;
- latency min / max / average inputs;
- first-seen and last-seen timestamps;
- first/last supporting Evidence ids;
- the same operational signals per endpoint + Environment;
- derived read models with rates and observations-per-session.

## Identity

Operational knowledge attaches to `catalog_endpoint_id`, not to the physical Normalizer endpoint id.

```text
Service
  ↓
Logical Endpoint
  ↓
Operational Signals
      ├── all environments
      └── per environment
```

## Idempotency

Every `catalog_ingestion_events` row has an `operational_signal_status`. The aggregate contribution and status transition are committed in one D1 `batch()`.

Distinct session/environment counts use durable presence sets:

```text
catalog_endpoint_session_presence
catalog_endpoint_environment_presence
```

The presence row records `introduced_by_event_id`. This lets the same atomic batch determine whether an Evidence event introduced a new distinct session/environment without storing unbounded sets in Worker memory.

## Latency

v1 stores exact:

- count;
- total;
- minimum;
- maximum.

Average is derived by the read model. Percentiles remain a future evolution; no fake p95 is produced from insufficient data structures.

## Semantics

`success_count` means HTTP 2xx, matching the existing Normalizer semantics.

The outcome buckets are mutually exclusive:

```text
HTTP_1XX
HTTP_2XX
HTTP_3XX
HTTP_4XX
HTTP_5XX
NETWORK_FAILURE
NO_STATUS
```

## Out of scope

- alerting/monitoring;
- SLOs;
- percentile histograms;
- risk score;
- Discovery Confidence;
- endpoint lifecycle;
- Query API/Console.
