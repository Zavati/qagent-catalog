# Deploy & Verify — Foundation 07.5.11

## 1. Preserve local infrastructure value

Keep `.git/` and copy only the real `database_id` into the new `wrangler.toml`.

Expected release metadata:

```toml
FOUNDATION = "07.5.11"
REVISION = "catalog-query-v1"
CATALOG_QUERY_MAX_SKEW_SECONDS = "300"

[secrets]
required = [ "CATALOG_QUERY_HMAC_SECRET" ]
```

## 2. Configure Query API HMAC secret

Generate a strong random secret (at least 32 characters) and store the same value securely for the Gateway integration in the next phase. The snapshot declares only the secret **name** using `[secrets].required`; the secret value never belongs in Git.

Prefer adding `CATALOG_QUERY_HMAC_SECRET` in the Cloudflare Worker Variables/Secrets settings before the Git deploy. If you use Wrangler instead, the supported command is:

```bash
npx wrangler secret put CATALOG_QUERY_HMAC_SECRET
```

Note that `wrangler secret put` creates/deploys a Worker version, so apply migration `0011` first if you choose the CLI path.

Do not place the secret in `wrangler.toml`, Git, ZIPs, Console code or browser storage.

## 3. Validate and migrate

```bash
npm ci
npm run check
npx wrangler d1 migrations apply qagent-catalog-dev --remote
```

Expected migration:

```text
0011_query_api.sql
```

## 4. Deploy

```bash
git add .
git commit -m "feat: foundation 07.5.11 catalog query api"
git push
```

Health:

```text
GET https://api.apiqagent.com/v1/catalog/health
```

Expected:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.11",
  "revision": "catalog-query-v1",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## 5. Resolve a real tenant scope

In D1:

```sql
SELECT DISTINCT organization_id, project_id
FROM catalog_endpoints
ORDER BY project_id
LIMIT 20;
```

## 6. Sign a query locally

Set the same secret used in Cloudflare only in your local shell environment, then:

```bash
npm run sign:query -- \
  "https://api.apiqagent.com/v1/catalog/projects/<PROJECT_ID>/summary" \
  "<ORGANIZATION_ID>" \
  "<PROJECT_ID>"
```

The script prints four headers and a ready-to-run curl command. Signatures expire after five minutes by default.

## 7. Validate tenant boundary

Without signed headers:

```text
GET /v1/catalog/projects/<PROJECT_ID>/endpoints
→ 401 QUERY_AUTH_REQUIRED
```

With valid signed headers:

```text
→ 200
```

Changing any signed query parameter after signing:

```text
→ 401 INVALID_QUERY_SIGNATURE
```

Using a signed project that does not match `/projects/:projectId/...`:

```text
→ 403 PROJECT_SCOPE_MISMATCH
```

## 8. Validate API reads

Recommended sequence:

```text
/projects/:projectId/summary
/projects/:projectId/services?limit=20
/projects/:projectId/endpoints?limit=20
/endpoints/:endpointId
/endpoints/:endpointId/evidence?limit=20
/endpoints/:endpointId/schemas?versionsPerTrack=10
/endpoints/:endpointId/lifecycle-history?limit=20
```

Re-sign each distinct URL because the query string is part of the signature.
