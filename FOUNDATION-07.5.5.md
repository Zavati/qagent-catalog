# Foundation 07.5.5 — Classification Engine

## Goal

Turn discovered Services into automatically categorized, explainable knowledge without treating heuristics as silent truth.

Supported classifications:

```text
FIRST_PARTY_API
INTEGRATION
THIRD_PARTY
ANALYTICS
OBSERVABILITY
STATIC_ASSET
UNKNOWN
```

Supported decision sources:

```text
DETERMINISTIC
HEURISTIC
USER_CONFIRMED   (reserved for QA Curation)
AI_SUGGESTED     (reserved for a future AI-assisted flow)
```

## Important distinction

`classification_confidence` means confidence that the selected **category** is correct.
It is deliberately separate from Foundation 07.5.8 Discovery Confidence, which will measure confidence in discovered operational knowledge.

## Processing pipeline

```text
catalog_ingestion_events
      ↓
classification signal accumulator
      ↓
catalog_service_classification_signals
      ↓
Classification Engine v1
      ↓
catalog_services.classification
```

Every ingestion event contributes to classification aggregates at most once.
The classifier reads one bounded aggregate row per Service rather than rescanning the entire observation history.

## Explainability

Every automatic classification stores:

- classification;
- classification confidence (0-100);
- source;
- engine version;
- reason codes + details;
- aggregate signals used for the decision;
- classified timestamp.

No raw request/response payload is introduced.

## Safety / authority rules

- Known signatures may produce deterministic classifications.
- Generic behavior uses conservative heuristics.
- Conflicting deterministic signatures become `UNKNOWN` rather than being guessed.
- Future `USER_CONFIRMED` classifications are protected from automatic overwrite.
- AI is not used in 07.5.5.
- Classification does not alter Service Identity or Endpoint Identity.

## Current inheritance model

Classification is materialized on `catalog_services`.
Logical endpoints obtain their classification through `service_id` rather than duplicating mutable classification state on every endpoint row.
