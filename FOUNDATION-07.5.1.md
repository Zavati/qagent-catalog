# Foundation 07.5.1 — qagent-catalog Foundation

## Goal

Create the smallest independent, deployable Knowledge Layer service before introducing Catalog domain decisions.

## Delivered

- `qagent-catalog` Worker foundation;
- D1 binding named `CATALOG_DB`;
- D1 database name reserved as `qagent-catalog-dev`;
- `0001_catalog_foundation.sql`;
- strict TypeScript configuration;
- Cloudflare Workers Vitest configuration;
- `GET /health` and `/v1/catalog/health` routing;
- 405 and 404 behavior;
- Git hygiene and snapshot rules.

## Intentionally not delivered

- Normalizer → Catalog Queue;
- Catalog ingestion contract;
- service identity;
- stable logical endpoint identity;
- classification;
- schema versioning;
- evidence;
- confidence;
- Query API;
- Console;
- AI Test Design;
- Runner.

## Required real-environment steps

1. Create GitHub repository `qagent-catalog`.
2. Preserve `.git/` locally between ZIP replacements.
3. Create D1 database `qagent-catalog-dev`.
4. Replace the zero UUID in `wrangler.toml` with the real D1 database ID.
5. Run `npm ci`.
6. Run `npm run check`.
7. Apply remote migration.
8. Commit/push.
9. Connect/deploy Worker in Cloudflare.
10. Configure route `api.apiqagent.com/v1/catalog/*`.
11. Validate `/v1/catalog/health`.
12. Query `catalog_metadata` in D1 and confirm `schema_foundation = 07.5.1`.

## Validation SQL

```sql
SELECT meta_key, meta_value, updated_at
FROM catalog_metadata
ORDER BY meta_key;
```

Expected logical result:

```text
schema_foundation | 07.5.1 | <timestamp>
```

## Exit criteria

```text
repository exists
+ local check green
+ qagent-catalog-dev exists
+ migration applied
+ Worker deployed
+ public health = 200
+ metadata SQL returns foundation 07.5.1
```

Only then start Foundation 07.5.2 — Catalog Ingestion Contract v1.
