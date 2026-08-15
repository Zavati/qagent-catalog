# Deploy / Verify — Foundation 07.5.4

Preserve `.git/`. Extract the snapshot. From the old `wrangler.toml`, preserve only the real D1 `database_id`.

```bash
npm ci
npm run check
npx wrangler d1 migrations apply qagent-catalog-dev --remote
```

Expected health:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.4",
  "revision": "logical-endpoint-identity-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## Endpoint processing

```sql
SELECT endpoint_identity_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY endpoint_identity_status;
```

The current 46-event dataset should converge to `PROCESSED | 46`.

## Logical endpoints

```sql
SELECT
  endpoint_id,
  service_id,
  method,
  normalized_path,
  endpoint_key,
  identity_strategy,
  identity_version,
  first_seen_at,
  last_seen_at
FROM catalog_endpoints
ORDER BY service_id, method, normalized_path;
```

The captured 46-event dataset contains 16 unique Service + Method + Normalized Path combinations, so the expected initial cardinality is 16 logical endpoints.

## Physical bindings

```sql
SELECT
  endpoint_binding_id,
  endpoint_id,
  service_id,
  service_host_id,
  environment_id,
  first_seen_at,
  last_seen_at
FROM catalog_endpoint_bindings
ORDER BY last_seen_at DESC;
```

With the current one-environment dataset, expect 16 bindings.

## Traceability

```sql
SELECT
  event_id,
  method,
  host,
  normalized_path,
  service_id,
  catalog_endpoint_id,
  endpoint_identity_status
FROM catalog_ingestion_events
ORDER BY received_at DESC
LIMIT 100;
```

Every processed fact should point to `svc_*` and `cep_*`.

## Duplicate guard

```sql
SELECT
  organization_id,
  project_id,
  service_id,
  method,
  normalized_path,
  COUNT(*) AS total
FROM catalog_endpoints
GROUP BY organization_id, project_id, service_id, method, normalized_path
HAVING COUNT(*) > 1;
```

Expected: zero rows.
