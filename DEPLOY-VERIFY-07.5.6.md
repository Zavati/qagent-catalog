# Deploy & Verify — Foundation 07.5.6

## Deploy

1. Preserve `.git/`.
2. From the existing `wrangler.toml`, preserve only the real `database_id`.
3. Extract the new snapshot and restore that real ID in the new `wrangler.toml`.
4. Run `npm ci` and `npm run check`.
5. Apply `npx wrangler d1 migrations apply qagent-catalog-dev --remote`.
6. Commit/push and deploy.

## Health

Expected:
- foundation: `07.5.6`
- revision: `schema-versioning-v1`

## Processing status

```sql
SELECT schema_consolidation_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY schema_consolidation_status;
```

Expected after the recovery sweep: all eligible events `PROCESSED` and zero `FAILED`.

## Contract tracks

```sql
SELECT
  t.schema_track_id,
  e.method,
  e.normalized_path,
  t.direction,
  t.status_code,
  t.current_version_number,
  t.distinct_version_count,
  t.current_schema_hash,
  t.first_seen_at,
  t.last_seen_at
FROM catalog_endpoint_schema_tracks t
JOIN catalog_endpoints e ON e.endpoint_id = t.endpoint_id
ORDER BY e.method, e.normalized_path, t.direction, t.status_code;
```

## Schema versions

```sql
SELECT
  v.schema_version_id,
  v.schema_track_id,
  v.direction,
  v.status_code,
  v.version_number,
  v.schema_hash,
  v.is_partial,
  v.node_count,
  v.property_count,
  v.max_depth,
  v.observation_count,
  v.predecessor_schema_version_id,
  v.first_seen_at,
  v.last_seen_at
FROM catalog_schema_versions v
ORDER BY v.schema_track_id, v.version_number;
```

## Versioned endpoint view

```sql
SELECT
  e.method,
  e.normalized_path,
  s.display_name AS service,
  t.direction,
  t.status_code,
  v.version_number,
  v.schema_hash,
  v.observation_count,
  v.schema_json
FROM catalog_schema_versions v
JOIN catalog_endpoint_schema_tracks t ON t.schema_track_id = v.schema_track_id
JOIN catalog_endpoints e ON e.endpoint_id = v.endpoint_id
JOIN catalog_services s ON s.service_id = e.service_id
ORDER BY s.display_name, e.method, e.normalized_path, t.direction, t.status_code, v.version_number;
```

## Environment drift readiness

```sql
SELECT
  e.method,
  e.normalized_path,
  st.direction,
  st.status_code,
  es.environment_id,
  es.current_version_number,
  es.current_schema_hash,
  es.current_observed_at
FROM catalog_schema_environment_state es
JOIN catalog_endpoint_schema_tracks st ON st.schema_track_id = es.schema_track_id
JOIN catalog_endpoints e ON e.endpoint_id = es.endpoint_id
ORDER BY e.method, e.normalized_path, st.direction, st.status_code, es.environment_id;
```

## New-version evidence

```sql
SELECT
  event_id,
  catalog_endpoint_id,
  status_code,
  request_schema_hash,
  request_schema_version_id,
  request_schema_new_version,
  response_schema_hash,
  response_schema_version_id,
  response_schema_new_version,
  schema_consolidation_status
FROM catalog_ingestion_events
WHERE request_schema_hash IS NOT NULL OR response_schema_hash IS NOT NULL
ORDER BY observed_at DESC
LIMIT 100;
```

## Storage consolidation

```sql
SELECT
  SUM(CASE WHEN request_schema_json IS NOT NULL THEN 1 ELSE 0 END) AS request_json_remaining,
  SUM(CASE WHEN response_schema_json IS NOT NULL THEN 1 ELSE 0 END) AS response_json_remaining
FROM catalog_ingestion_events
WHERE schema_consolidation_status = 'PROCESSED';
```

Expected: `0 | 0`.

## Consistency

```sql
SELECT schema_track_id, schema_hash, COUNT(*) AS duplicates
FROM catalog_schema_versions
GROUP BY schema_track_id, schema_hash
HAVING COUNT(*) > 1;
```

Expected: 0 rows.

```sql
SELECT schema_track_id, version_number, COUNT(*) AS duplicates
FROM catalog_schema_versions
GROUP BY schema_track_id, version_number
HAVING COUNT(*) > 1;
```

Expected: 0 rows.
