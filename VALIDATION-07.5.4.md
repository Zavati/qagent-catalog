# Validation — Foundation 07.5.4

Validated before packaging:

- TypeScript source passes `tsc --noEmit` with Cloudflare Worker/D1 interface stubs.
- Migrations `0001` through `0004` apply sequentially in SQLite.
- `schema_foundation` becomes `07.5.4`.
- `logical_endpoint_identity_version` becomes `logical-endpoint-v1`.
- The real 46-event validation dataset materializes exactly **16** unique logical endpoints.
- The same dataset materializes exactly **16** endpoint physical bindings.
- Replaying events out of chronological order preserves the true earliest `first_seen_at` and latest `last_seen_at`.
- Duplicate logical identity query returns zero rows.
- Logical IDs are deterministic `cep_*`.
- Physical binding IDs are deterministic `ceb_*`.
- Environment and physical host remain outside the logical endpoint identity.
- Build guard requires D1, Queue consumer, recovery Cron, Foundation `07.5.4` and revision `logical-endpoint-identity-v1`.

`npm ci` could not be completed inside the packaging sandbox because dependency installation timed out. The Cloudflare build (`npm ci && npm run build`) remains the authoritative dependency/runtime validation.
