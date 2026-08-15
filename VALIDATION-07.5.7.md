# Validation — Foundation 07.5.7

Validated before packaging:

- deterministic tenant/project-scoped Evidence IDs;
- SHA-256 evidence fingerprints over immutable safe facts;
- no mutable Service/Endpoint/Schema-version IDs inside the fingerprint contract;
- no raw payload/body/schema JSON in the evidence fingerprint contract;
- neutral HTTP/network outcome classes;
- Evidence only becomes eligible after Service + Logical Endpoint + Schema consolidation are complete;
- replay is idempotent through `evidence_status`;
- migration chain `0001` through `0007` applies cleanly in SQLite;
- evidence views compile in SQLite and expose endpoint/schema provenance from a representative processed fact;
- `schema_foundation = 07.5.7` and `evidence_model_version = evidence-v1` are recorded;
- release metadata guard source updated to `07.5.7 / evidence-model-v1`;
- snapshot excludes `.git`, `node_modules`, `.wrangler` and generated `worker-configuration.d.ts`.

The local sandbox did not complete `npm ci`, so the authoritative TypeScript/Workers validation remains the deployment environment command:

```bash
npm ci
npm run check
```

followed by the remote D1 migration and deployment.
