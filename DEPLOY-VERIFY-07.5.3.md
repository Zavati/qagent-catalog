# Deploy & Verify — Foundation 07.5.3

1. Extract the snapshot preserving `.git/`.
2. Do **not** preserve the old `wrangler.toml` as a whole. Copy only the real `database_id` into the new file.
3. Confirm `[[queues.consumers]]` still targets `qagent-catalog-updates-dev`.
4. Run `npm ci && npm run check`.
5. Apply D1 migrations: `npx wrangler d1 migrations apply qagent-catalog-dev --remote`.
6. Commit/push/deploy.
7. Health must report foundation `07.5.3`, revision `service-identity-v1`.
8. Wait up to five minutes or generate new Plugin traffic. Existing `PENDING` inbox rows are automatically swept.

## Expected database state

```sql
SELECT processing_status, COUNT(*) AS total
FROM catalog_ingestion_events
GROUP BY processing_status;
```

Expected: existing events move from `PENDING` to `PROCESSED`.

```sql
SELECT service_id, display_name, identity_strategy, identity_version, first_seen_at, last_seen_at
FROM catalog_services
ORDER BY last_seen_at DESC;
```

```sql
SELECT service_id, environment_id, scheme, host, hostname, port, host_role, mapping_source
FROM catalog_service_hosts
ORDER BY last_seen_at DESC;
```

Traceability:

```sql
SELECT event_id, host, normalized_path, service_id, service_host_id, processing_status
FROM catalog_ingestion_events
ORDER BY received_at DESC
LIMIT 100;
```
