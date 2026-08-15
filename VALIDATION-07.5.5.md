# Validation — Foundation 07.5.5

Validated before packaging:

- TypeScript source passes `tsc --noEmit` with temporary Cloudflare Worker/D1 interface stubs.
- Migrations `0001` through `0005` apply sequentially in SQLite.
- `schema_foundation` becomes `07.5.5`.
- `classification_engine_version` becomes `classification-v1`.
- Classification signal aggregate INSERT has 20 SQL placeholders and 20 binds.
- The real 46-event dataset generates 46 processed classification signals and exactly 46 aggregate observations across 8 Services.
- Replaying an already processed event leaves the aggregate observation total at 46 (no double count).
- Signal aggregation preserves bounded per-Service state instead of rescanning full event history on every classification.
- The real 8-Service dataset is classified as:
  - 6 ANALYTICS;
  - 1 FIRST_PARTY_API;
  - 1 INTEGRATION.
- `app.impulso.team` => `FIRST_PARTY_API`, heuristic, confidence 100.
- `next.impulso.app` => `INTEGRATION`, heuristic, confidence 90.
- Google Analytics / LinkedIn Ads / Hotjar / Brevo automation telemetry / HubSpot telemetry signatures => deterministic ANALYTICS.
- Conflicting deterministic analytics + observability signatures produce `UNKNOWN` rather than an unsafe guess.
- Static-resource dominant traffic is evaluated before generic external/integration classification.
- `USER_CONFIRMED` is a reserved source and automatic processing is coded not to overwrite it.
- Classification confidence remains explicitly separate from future Discovery Confidence.
- No request/response raw payload is introduced.
- Build guard requires D1, Queue consumer, recovery Cron, Foundation `07.5.5` and revision `classification-engine-v1`.

`npm ci` could not be completed inside the packaging sandbox. The Cloudflare build (`npm clean-install` / `npm run build`) remains the authoritative dependency/runtime validation.
