# Deploy & Verify — Foundation 07.5.2

## 1. Queues (create once)

```bash
npx wrangler queues create qagent-catalog-updates-dev
npx wrangler queues create qagent-catalog-updates-dlq-dev
```

## 2. Catalog

Preserve the real `CATALOG_DB.database_id` in `wrangler.toml`.

```bash
npm ci
npm run check
npx wrangler d1 migrations apply qagent-catalog-dev --remote
npm run deploy
```

Verify migration:

```sql
SELECT meta_key, meta_value, updated_at
FROM catalog_metadata
ORDER BY meta_key;
```

Expected `schema_foundation = 07.5.2`.

## 3. Normalizer

Preserve the real `NORMALIZER_DB.database_id` in `wrangler.toml`.
Deploy after the Catalog consumer is ready.

```bash
npm ci
npm run check
npm run deploy
```

## 4. Produce fresh traffic

Only new normalized observations after this deployment publish Catalog updates. Existing rows are not backfilled in 07.5.2.

## 5. Verify Catalog inbox

```sql
SELECT
  event_id,
  schema_version,
  organization_id,
  project_id,
  environment_id,
  method,
  scheme,
  host,
  normalized_path,
  status_code,
  network_failure,
  origin_relation,
  latency_ms,
  resource_type,
  request_schema_hash,
  response_schema_hash,
  processing_status,
  observed_at,
  received_at
FROM catalog_ingestion_events
ORDER BY received_at DESC
LIMIT 100;
```

Expected: fresh rows with `processing_status = 'PENDING'`.

## 6. Idempotency check

```sql
SELECT normalized_event_id, COUNT(*) AS rows_per_event
FROM catalog_ingestion_events
GROUP BY normalized_event_id
HAVING COUNT(*) > 1;
```

Expected: zero rows.
