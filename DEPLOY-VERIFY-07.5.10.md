# Deploy & Verify — Foundation 07.5.10

## Deploy

Preserve `.git/` and only copy the real `database_id` into the new `wrangler.toml`.

```bash
npm ci
npm run check
npx wrangler d1 migrations apply qagent-catalog-dev --remote
git add .
git commit -m "feat: foundation 07.5.10 catalog lifecycle"
git push
```

Expected health:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.10",
  "revision": "catalog-lifecycle-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## 1. Lifecycle distribution

```sql
SELECT
    lifecycle_state,
    lifecycle_source,
    COUNT(*) AS endpoints
FROM catalog_endpoints
GROUP BY lifecycle_state, lifecycle_source
ORDER BY lifecycle_state, lifecycle_source;
```

Immediately after migration, existing endpoints should be:

```text
DISCOVERED | AUTO | <current endpoint count>
```

## 2. Audit coverage

```sql
SELECT
    (SELECT COUNT(*) FROM catalog_endpoints) AS endpoints,
    (SELECT COUNT(DISTINCT endpoint_id) FROM catalog_endpoint_lifecycle_events) AS endpoints_with_history;
```

Expected after migration:

```text
endpoints = endpoints_with_history
```

## 3. Revision/history integrity

```sql
SELECT
    e.endpoint_id,
    e.lifecycle_revision,
    MAX(h.lifecycle_revision) AS history_revision
FROM catalog_endpoints e
LEFT JOIN catalog_endpoint_lifecycle_events h
    ON h.endpoint_id = e.endpoint_id
GROUP BY e.endpoint_id, e.lifecycle_revision
HAVING e.lifecycle_revision <> COALESCE(MAX(h.lifecycle_revision), 0);
```

Expected:

```text
0 rows
```

## 4. Lifecycle read model

```sql
SELECT
    service_name,
    classification,
    method,
    normalized_path,
    discovery_confidence_score,
    discovery_confidence_level,
    lifecycle_state,
    lifecycle_source,
    lifecycle_revision,
    has_user_decision,
    has_new_evidence_since_lifecycle_change,
    last_seen_at,
    lifecycle_updated_at
FROM catalog_endpoint_lifecycle_v1
ORDER BY discovery_confidence_score DESC, last_seen_at DESC
LIMIT 100;
```

## 5. Audit history

```sql
SELECT
    lifecycle_event_id,
    service_name,
    method,
    normalized_path,
    lifecycle_revision,
    from_state,
    to_state,
    source,
    actor_id,
    reason,
    changed_at
FROM catalog_endpoint_lifecycle_history_v1
ORDER BY changed_at DESC
LIMIT 100;
```

Existing migrated endpoints should each show an initial revision 1:

```text
NULL -> DISCOVERED / AUTO
```

## Important

There is intentionally no public lifecycle mutation endpoint in 07.5.10. Do not modify lifecycle using ad-hoc production SQL as a product workflow. Mutations will be exposed through authenticated QA Curation in Foundation 07.5.13.
