# Deploy / Verify — Foundation 07.5.5

## 1. Replace snapshot

Preserve `.git/` and copy only the real `database_id` from the previous `wrangler.toml` into the new one.
Do not preserve the old `wrangler.toml` wholesale.

The new release metadata must remain:

```toml
FOUNDATION = "07.5.5"
REVISION = "classification-engine-v1"
```

## 2. Local/build validation

```bash
npm ci
npm run check
```

## 3. Apply D1 migration

```bash
npx wrangler d1 migrations apply qagent-catalog-dev --remote
```

Expected new migration:

```text
0005_classification_engine.sql
```

## 4. Deploy

Commit/push using the existing Cloudflare build integration.

## 5. Health

```http
GET https://api.apiqagent.com/v1/catalog/health
```

Expected:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.5",
  "revision": "classification-engine-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## 6. Classification signal backfill

Existing events receive `classification_signal_status = PENDING` from the migration and are recovered by the Queue/scheduled sweep.

```sql
SELECT
    classification_signal_status,
    COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY classification_signal_status;
```

For the current 46-event dataset, expected after processing:

```text
PROCESSED | 46
```

## 7. Aggregate integrity

```sql
SELECT
    (SELECT COUNT(*)
       FROM catalog_ingestion_events
      WHERE classification_signal_status = 'PROCESSED') AS processed_event_signals,
    (SELECT COALESCE(SUM(observation_count), 0)
       FROM catalog_service_classification_signals) AS aggregated_observations;
```

The two values must be equal. For the current dataset both should be `46`.

## 8. Classification status

```sql
SELECT
    classification_status,
    COUNT(*) AS total
FROM catalog_services
GROUP BY classification_status;
```

Current dataset expected:

```text
PROCESSED | 8
```

## 9. Classification distribution

```sql
SELECT
    classification,
    COUNT(*) AS services
FROM catalog_services
GROUP BY classification
ORDER BY services DESC, classification;
```

With the currently validated real dataset, expected v1 result:

```text
ANALYTICS       | 6
FIRST_PARTY_API | 1
INTEGRATION     | 1
```

## 10. Explainability

```sql
SELECT
    display_name,
    classification,
    classification_confidence,
    classification_source,
    classification_engine_version,
    classification_reasons_json
FROM catalog_services
ORDER BY classification, display_name;
```

Expected examples include:

```text
app.impulso.team          → FIRST_PARTY_API / HEURISTIC
next.impulso.app          → INTEGRATION / HEURISTIC
www.google-analytics.com  → ANALYTICS / DETERMINISTIC
px.ads.linkedin.com       → ANALYTICS / DETERMINISTIC
```

## 11. Signal inspection

```sql
SELECT
    s.display_name,
    sig.observation_count,
    sig.same_origin_count,
    sig.external_count,
    sig.api_transport_count,
    sig.schema_signal_count,
    sig.api_path_count,
    sig.known_analytics_count,
    sig.known_observability_count,
    sig.analytics_signature_code,
    sig.observability_signature_code
FROM catalog_services s
JOIN catalog_service_classification_signals sig
  ON sig.service_id = s.service_id
ORDER BY s.display_name;
```
