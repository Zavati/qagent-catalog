# Validation — Foundation 07.5.8

Validated before snapshot packaging:

- migrations `0001` through `0008` apply cleanly in SQLite;
- operational outcome buckets are mutually exclusive;
- repository SQL placeholder/bind counts match;
- three Evidence events across two sessions/two environments aggregate to one logical endpoint correctly;
- same-session events do not inflate `session_count`;
- same-environment events do not inflate `environment_count`;
- out-of-order Evidence preserves true `first_seen_at` / `last_seen_at`;
- latency total/min/max remain correct;
- first/last Evidence ids follow observation chronology;
- replaying an already `PROCESSED` operational event is a no-op;
- operational read model derives success rate, average latency and observations/session without persisted denominator drift;
- TypeScript source compiles with a local Worker API type stub.

Authoritative Cloudflare validation remains:

```bash
npm ci
npm run check
```
