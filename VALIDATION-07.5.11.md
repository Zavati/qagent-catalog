# Validation — Foundation 07.5.11

Validated before packaging:

- migrations `0001` through `0011` apply cleanly in SQLite;
- `schema_foundation = 07.5.11`;
- `query_api_version = catalog-query-v1`;
- read models `catalog_query_services_v1` and `catalog_query_endpoints_v1` are created;
- TypeScript source passes `tsc --noEmit` with a temporary local Worker type shim;
- Query API uses HMAC-SHA256 with method/path/canonical-query/tenant/timestamp binding;
- project route scope is checked after signature verification;
- opaque pagination is keyset-based, not offset-based;
- every endpoint/detail/evidence/schema/history repository query includes `organization_id + project_id` scope;
- Query API is GET-only;
- health remains public;
- HMAC secret is not represented in `wrangler.toml` or generated ZIP;
- ZIP excludes `.git`, `node_modules`, `.wrangler` and `worker-configuration.d.ts`.

Environment-authoritative validation remains:

```bash
npm ci
npm run check
```

and signed real requests after Cloudflare deployment.

Additional read-model validation used two logical endpoints and two physical host/environment bindings for the same service. `catalog_query_services_v1` returned exactly 2 endpoints, 30 observations, 2 environments and 2 host bindings, confirming that host joins do not multiply endpoint/traffic aggregates.
