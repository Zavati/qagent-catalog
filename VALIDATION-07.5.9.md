# Validation — Foundation 07.5.9

Validation performed before snapshot creation:

- migrations `0001 -> 0009` apply cleanly in isolated SQLite;
- `schema_foundation = 07.5.9`;
- `discovery_confidence_version = discovery-confidence-v1`;
- TypeScript source passes a strict local compile using a temporary Worker binding stub;
- deterministic rule harness validated HIGH first-party, HIGH integration, VERY_LOW analytics and VERY_LOW one-off/unknown behavior;
- reason deltas reconstruct the clamped final score;
- confidence read model created successfully;
- release metadata guard validates D1, Queue consumer, Cron, Foundation and revision;
- `node_modules`, `.git`, `.wrangler` and generated `worker-configuration.d.ts` are excluded from the snapshot.

The authoritative Cloudflare validation remains:

```bash
npm ci
npm run check
```

before deployment.
