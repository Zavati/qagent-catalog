# Deploy / Verify — Foundation 07.5.9

## Deploy

Preserve `.git/`. From the previous `wrangler.toml`, preserve only the real D1 `database_id` and place it into the new snapshot.

```bash
npm ci
npm run check
npx wrangler d1 migrations apply qagent-catalog-dev --remote

git add .
git commit -m "feat: foundation 07.5.9 discovery confidence"
git push
```

Migration:

```text
0009_discovery_confidence.sql
```

## Health

```http
GET https://api.apiqagent.com/v1/catalog/health
```

Expected:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.9",
  "revision": "discovery-confidence-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## 1. Processing status

```sql
SELECT
    discovery_confidence_status,
    COUNT(*) AS endpoints
FROM catalog_endpoints
GROUP BY discovery_confidence_status;
```

After the bounded sweeps drain, expected:

```text
PROCESSED = every endpoint with operational signals and a processed Service classification
FAILED    = 0
```

## 2. Confidence distribution

```sql
SELECT
    discovery_confidence_level,
    COUNT(*) AS endpoints,
    ROUND(AVG(discovery_confidence_score), 2) AS avg_score,
    MIN(discovery_confidence_score) AS min_score,
    MAX(discovery_confidence_score) AS max_score
FROM catalog_endpoints
WHERE discovery_confidence_status = 'PROCESSED'
GROUP BY discovery_confidence_level
ORDER BY avg_score DESC;
```

## 3. Explainability / future Console read model

```sql
SELECT
    service_name,
    classification,
    classification_confidence,
    method,
    normalized_path,

    observation_count,
    session_count,
    environment_count,
    schema_track_count,
    stable_schema_track_count,

    discovery_confidence_score,
    discovery_confidence_level,
    discovery_confidence_reasons_json,
    discovery_confidence_signals_json,
    discovery_confidence_calculated_at

FROM catalog_endpoint_discovery_confidence_v1
WHERE discovery_confidence_status = 'PROCESSED'
ORDER BY
    discovery_confidence_score DESC,
    observation_count DESC,
    last_seen_at DESC
LIMIT 100;
```

## 4. Functional candidates

```sql
SELECT
    service_name,
    classification,
    method,
    normalized_path,
    observation_count,
    session_count,
    schema_track_count,
    discovery_confidence_score,
    discovery_confidence_level
FROM catalog_endpoint_discovery_confidence_v1
WHERE discovery_confidence_status = 'PROCESSED'
  AND classification IN ('FIRST_PARTY_API', 'INTEGRATION', 'UNKNOWN')
ORDER BY discovery_confidence_score DESC, observation_count DESC
LIMIT 100;
```

This is already close to a future Catalog ranking/read model, but Foundation 07.5.11 Query API remains the official UI boundary.

## 5. Noise should remain deprioritized

```sql
SELECT
    classification,
    discovery_confidence_level,
    COUNT(*) AS endpoints,
    ROUND(AVG(discovery_confidence_score), 2) AS avg_score
FROM catalog_endpoint_discovery_confidence_v1
WHERE discovery_confidence_status = 'PROCESSED'
  AND classification IN ('ANALYTICS', 'OBSERVABILITY', 'STATIC_ASSET')
GROUP BY classification, discovery_confidence_level
ORDER BY classification, avg_score DESC;
```

High traffic must not silently promote Analytics/Observability/Static Asset traffic into high-confidence functional API knowledge.

## 6. Failed / stale diagnostics

```sql
SELECT
    endpoint_id,
    method,
    normalized_path,
    discovery_confidence_status,
    discovery_confidence_attempts,
    discovery_confidence_last_attempt_at,
    discovery_confidence_error
FROM catalog_endpoints
WHERE discovery_confidence_status = 'FAILED'
ORDER BY discovery_confidence_last_attempt_at DESC;
```

Expected: `0 rows`.
