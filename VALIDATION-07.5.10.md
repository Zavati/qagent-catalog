# Validation — Foundation 07.5.10

Validated before packaging:

- migrations 0001 through 0010 apply in order on SQLite;
- `schema_foundation = 07.5.10`;
- `catalog_lifecycle_version = catalog-lifecycle-v1`;
- existing endpoint backfill becomes DISCOVERED/AUTO revision 1;
- every backfilled endpoint gets an immutable lifecycle audit event;
- lifecycle views are created successfully;
- endpoint identity inserts lifecycle fields for newly discovered endpoints;
- endpoint upsert conflict path does not overwrite lifecycle columns;
- explicit USER decisions are protected from SYSTEM overwrite in transition rules;
- IGNORED/DEPRECATED transitions require a reason;
- lifecycle revisions support optimistic concurrency;
- lifecycle audit ids are deterministic for retry safety;
- snapshot excludes `.git`, `node_modules`, `.wrangler` and generated `worker-configuration.d.ts`.

The local container had incomplete cached npm packages (`wrangler` binary unavailable), so the authoritative Workers/TypeScript/Vitest validation remains:

```bash
npm ci
npm run check
```

before Cloudflare deploy.
