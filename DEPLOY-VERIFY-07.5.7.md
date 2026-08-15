# Deploy & Verify — Foundation 07.5.7

## Deploy

1. Preserve `.git/`.
2. Preserve only the real `database_id` from the existing `wrangler.toml`.
3. Extract the new snapshot and restore the real D1 ID in the new `wrangler.toml`.
4. Run `npm ci` and `npm run check`.
5. Apply `npx wrangler d1 migrations apply qagent-catalog-dev --remote`.
6. Commit/push and deploy.

## Health

Expected:
- foundation: `07.5.7`
- revision: `evidence-model-v1`

## Evidence materialization status

```sql
SELECT evidence_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY evidence_status;
```

Expected after recovery sweeps: all eligible events `PROCESSED`, zero `FAILED`.

## Evidence identity uniqueness

```sql
SELECT evidence_id, COUNT(*) AS total
FROM catalog_ingestion_events
WHERE evidence_id IS NOT NULL
GROUP BY evidence_id
HAVING COUNT(*) > 1;
```

Expected: 0 rows.

## Evidence coverage

```sql
SELECT
  COUNT(*) AS eligible_events,
  SUM(CASE WHEN evidence_status = 'PROCESSED' THEN 1 ELSE 0 END) AS evidence_ready
FROM catalog_ingestion_events
WHERE processing_status = 'PROCESSED'
  AND endpoint_identity_status = 'PROCESSED'
  AND schema_consolidation_status = 'PROCESSED';
```

Expected: `eligible_events = evidence_ready` after backlog drain.

## Outcome distribution

```sql
SELECT evidence_outcome_class, COUNT(*) AS total
FROM catalog_evidence_v1
GROUP BY evidence_outcome_class
ORDER BY total DESC;
```

## Endpoint evidence

```sql
SELECT
  evidence_id,
  service_id,
  catalog_endpoint_id,
  environment_id,
  method,
  host,
  normalized_path,
  status_code,
  evidence_outcome_class,
  latency_ms,
  origin_relation,
  observation_session_id,
  normalized_event_id,
  observed_at
FROM catalog_evidence_v1
ORDER BY observed_at DESC
LIMIT 100;
```

## Schema provenance

```sql
SELECT
  evidence_id,
  catalog_endpoint_id,
  environment_id,
  direction,
  schema_status_code,
  schema_hash,
  schema_version_id,
  introduced_new_version,
  content_type,
  observed_at,
  normalized_event_id
FROM catalog_schema_evidence_v1
ORDER BY observed_at DESC
LIMIT 100;
```

## New schema versions and their introducing evidence

```sql
SELECT
  v.schema_version_id,
  v.direction,
  v.status_code,
  v.version_number,
  v.schema_hash,
  v.introduced_by_event_id,
  ev.evidence_id,
  ev.environment_id,
  ev.observed_at
FROM catalog_schema_versions v
JOIN catalog_evidence_v1 ev
  ON ev.event_id = v.introduced_by_event_id
ORDER BY v.created_at DESC;
```
