# Validation — Foundation 07.5.6

Validated before packaging:

- deterministic schema track/version/environment IDs;
- canonical structural hashing compatible with the Normalizer algorithm;
- mismatch detection before consolidation;
- REQUEST and RESPONSE/status contract separation;
- immutable version identity by structural hash;
- per-environment current contract state;
- content-type normalization;
- schema structure statistics;
- D1 migration chain through `0006`;
- ingestion-row structure pruning after durable consolidation;
- release metadata guard updated to `07.5.6 / schema-versioning-v1`.

Authoritative Cloudflare validation remains `npm ci && npm run check` followed by the remote D1 migration and deployment.


## Local integration harness result

Using SQLite with a D1-compatible adapter, four observations were replayed through the actual repository SQL:

- one REQUEST schema;
- RESPONSE 200 schema A observed three times;
- RESPONSE 200 schema B observed once;
- one event arrived later in processing order but had an older `observed_at`.

Result:

- first sweep: `processed=4`, `failed=0`;
- second sweep: `processed=0`, `failed=0`;
- REQUEST track: 1 structural version;
- RESPONSE 200 track: 2 structural versions;
- response v1 observation count: 3;
- response v2 observation count: 1;
- v2 predecessor correctly points to v1;
- late/older observations did not roll back the current schema;
- DEV and PROD maintained independent environment current-state;
- event-level schema JSON was pruned only after successful atomic consolidation;
- TypeScript source compilation passed with generated-binding-compatible stubs.
