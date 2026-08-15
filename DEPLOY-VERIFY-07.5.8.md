# Deploy / Verify — Foundation 07.5.8

## Deploy

Preserve `.git/`. From the previous `wrangler.toml`, copy only the real `database_id` into this snapshot.

```bash
npm ci
npm run check
npx wrangler d1 migrations apply qagent-catalog-dev --remote
```

Migration expected:

```text
0008_frequency_operational_signals.sql
```

Then commit/push/deploy.

## Health

Expected:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.8",
  "revision": "operational-signals-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## 1 — Backlog status

```sql
SELECT operational_signal_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY operational_signal_status;
```

After bounded sweeps, expect all eligible Evidence rows to be `PROCESSED` and zero `FAILED`.

## 2 — Coverage invariant

```sql
SELECT
  COUNT(*) AS evidence_ready,
  SUM(CASE WHEN operational_signal_status = 'PROCESSED' THEN 1 ELSE 0 END) AS operational_ready
FROM catalog_ingestion_events
WHERE evidence_status = 'PROCESSED';
```

Expected after drain:

```text
evidence_ready = operational_ready
```

## 3 — Aggregate conservation

```sql
SELECT
  (SELECT COUNT(*)
     FROM catalog_ingestion_events
    WHERE evidence_status = 'PROCESSED'
      AND operational_signal_status = 'PROCESSED') AS processed_evidence,
  (SELECT COALESCE(SUM(observation_count), 0)
     FROM catalog_endpoint_operational_signals) AS aggregated_observations;
```

Expected:

```text
processed_evidence = aggregated_observations
```

## 4 — Outcome conservation

```sql
SELECT
  endpoint_id,
  observation_count,
  informational_count + success_count + redirect_count
    + client_error_count + server_error_count
    + network_failure_count + no_status_count AS categorized_count
FROM catalog_endpoint_operational_signals
WHERE observation_count <> (
  informational_count + success_count + redirect_count
  + client_error_count + server_error_count
  + network_failure_count + no_status_count
);
```

Expected: `0 rows`.

## 5 — Exact distinct session/environment checks

```sql
SELECT
  s.endpoint_id,
  s.session_count,
  (SELECT COUNT(*) FROM catalog_endpoint_session_presence p
    WHERE p.endpoint_id = s.endpoint_id) AS exact_sessions,
  s.environment_count,
  (SELECT COUNT(*) FROM catalog_endpoint_environment_presence p
    WHERE p.endpoint_id = s.endpoint_id) AS exact_environments
FROM catalog_endpoint_operational_signals s
WHERE s.session_count <> (
    SELECT COUNT(*) FROM catalog_endpoint_session_presence p
    WHERE p.endpoint_id = s.endpoint_id
  )
   OR s.environment_count <> (
    SELECT COUNT(*) FROM catalog_endpoint_environment_presence p
    WHERE p.endpoint_id = s.endpoint_id
  );
```

Expected: `0 rows`.

## 6 — Product-facing operational summary

```sql
SELECT
  service_name,
  classification,
  method,
  normalized_path,
  observation_count,
  session_count,
  environment_count,
  success_count,
  client_error_count,
  server_error_count,
  network_failure_count,
  success_rate_pct,
  latency_avg_ms,
  latency_min_ms,
  latency_max_ms,
  observations_per_session,
  first_seen_at,
  last_seen_at
FROM catalog_endpoint_operational_summary_v1
ORDER BY observation_count DESC, last_seen_at DESC
LIMIT 100;
```

## 7 — Environment comparison

```sql
SELECT
  service_name,
  method,
  normalized_path,
  environment_id,
  observation_count,
  session_count,
  success_rate_pct,
  latency_avg_ms,
  latency_min_ms,
  latency_max_ms,
  first_seen_at,
  last_seen_at
FROM catalog_endpoint_environment_operational_summary_v1
ORDER BY method, normalized_path, environment_id;
```
