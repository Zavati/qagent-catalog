# Validation — Foundation 07.5.3

Validation targets:

- migration 0003 applies after 0001/0002;
- service IDs are deterministic and tenant/project-aware;
- physical binding IDs include Environment + scheme + authority;
- exact hostname is normalized conservatively;
- different hostnames are not silently merged;
- automatic discovery preserves a previously relinked host's service_id;
- existing PENDING ingestion rows can be recovered by bounded sweep;
- Queue consumer is declared in `wrangler.toml`;
- recovery Cron is declared in `wrangler.toml`;
- no raw payloads or secrets are introduced.

## Validation performed before snapshot

- migrations `0001` + `0002` + `0003` applied sequentially in SQLite: PASS;
- `schema_foundation = 07.5.3`: PASS;
- `service_identity_version = service-identity-v1`: PASS;
- new ingestion linkage/retry columns present: PASS;
- service/host UPSERT syntax executed in SQLite: PASS;
- future USER relink is preserved by deterministic host UPSERT: PASS;
- `first_seen_at` keeps the earliest observation and `last_seen_at` the latest: implemented;
- deterministic SHA-256 service/host IDs exercised from compiled TypeScript: PASS;
- static strict TypeScript compile with Worker binding surrogate: PASS;
- Wrangler D1 + Queue consumer + recovery Cron config guard: PASS;
- current 46-event validation dataset contains 8 distinct observed hostnames, so identity-v1 should converge to 8 service seeds and 8 physical bindings for that single Environment.

The sandbox could not complete `npm ci` with the Cloudflare devDependencies, so `npm run check` in the real repository remains the authoritative Wrangler/Vitest validation before deploy.
