# qagent-catalog

QAgent **Knowledge Layer**.

Foundation 07.5 converts safe, deterministic facts produced by the Processing Plane into durable API knowledge.

## Current scope — 07.5.1

This package contains only the deployable Catalog foundation:

- Cloudflare Worker;
- TypeScript strict;
- Wrangler;
- Vitest;
- independent D1 binding (`CATALOG_DB`);
- minimal metadata migration;
- health endpoint;
- public route normalization for `/v1/catalog/*`.

It intentionally does **not** implement endpoint identity, service grouping, schemas, classification, confidence, evidence, AI or Runner logic yet.

## Local bootstrap

```bash
npm ci
npm run check
```

## D1 creation

```bash
npx wrangler d1 create qagent-catalog-dev
```

Copy the returned database ID into `wrangler.toml`.

Then apply migrations: ese

```bash
npx wrangler d1 migrations apply qagent-catalog-dev --remote
```

## Development

```bash
npm run dev
```

## Health

Workers.dev:

```http
GET /health
```

Public route target:

```http
GET /v1/catalog/health
```

Expected payload:

```json
{
  "status": "ok",
  "service": "qagent-catalog",
  "foundation": "07.5.1",
  "revision": "foundation",
  "role": "knowledge-layer",
  "environment": "development"
}
```

## Deployment

After configuring the real D1 database ID:

```bash
npm run deploy
```

Recommended public Cloudflare route:

```text
api.apiqagent.com/v1/catalog/*
```

## Architectural invariant

```text
Observation knows what happened.
Normalizer knows what the fact means structurally.
Catalog knows what we believe exists in the system.
```
