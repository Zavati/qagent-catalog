# QAgent Foundation 07.5.7 — Evidence Model

## Goal

Make every durable Catalog belief explainable by a safe, tenant-scoped observation fact without duplicating raw payloads or duplicating the entire ingestion journal.

## Evidence Ledger

`catalog_ingestion_events` becomes the durable Evidence Ledger after the knowledge stages needed for provenance have completed. Each eligible event receives:

- deterministic `evidence_id` (`cev_*`);
- deterministic `evidence_fingerprint` (`evf_*`);
- `evidence_model_version = evidence-v1`;
- `evidence_kind = NETWORK_OBSERVATION`;
- neutral HTTP/network outcome class;
- processing/recovery state.

The evidence fingerprint intentionally covers only immutable safe facts received from the Processing Plane. It does **not** include mutable Catalog knowledge links such as Service/Endpoint IDs, so future human curation does not rewrite historical evidence identity.

## Storage model

No second full evidence table is created. This avoids doubling storage for high-volume network observations. Instead, storage-free SQLite views expose the finalized ledger:

- `catalog_evidence_v1` — endpoint/service/network provenance;
- `catalog_schema_evidence_v1` — request/response schema-version provenance.

The underlying row retains source references (`normalized_event_id`, `observation_session_id`, `batch_id`, Environment), observed timestamp, HTTP status, latency, origin relation, source host and schema/version references.

## Security

Evidence contains only already-sanitized and derived facts. Raw request/response payloads are not introduced. Schema JSON was already consolidated in 07.5.6 and is not copied into Evidence.

## Explainability

The model can answer questions such as:

- Why does QAgent believe this endpoint exists?
- Which sessions/environments observed it?
- Which facts introduced a schema version?
- Which status/latency/origin signals support operational knowledge?
- Which Normalizer event and batch produced this evidence?

Classification reasons remain stored on the Service; Service evidence can be queried through `service_id` to inspect the observations supporting those signals.

## Scale

Evidence materialization is O(1) per new Catalog event and uses the existing journal row. Recovery is bounded and idempotent through the scheduled sweep.
