# Validation — Foundation 07.5.2

Validated before packaging:

- TypeScript source consistency using strict compilation with isolated Cloudflare binding stubs.
- `0001` + `0002` migrations applied sequentially against isolated SQLite.
- `catalog_metadata.schema_foundation` advances to `07.5.2`.
- Repository INSERT has 29 SQL placeholders and 29 bind values.
- Sample `qagent.catalog-update.v1` row inserts successfully.
- Duplicate sample event remains one row because the inbox is idempotent.
- Contract validator is strict and rejects unexpected raw top-level fields.
- Normalizer builder derives schemas without carrying sample values, raw URL or page URL fields.

The sandbox dependency download did not complete in time, so the authoritative Cloudflare/Vitest validation remains:

```bash
npm ci
npm run check
```

Run this in each repository before deployment.
