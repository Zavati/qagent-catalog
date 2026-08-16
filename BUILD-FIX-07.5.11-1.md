# QAgent Catalog - 07.5.11 Build Fix 1

## Symptom

The TypeScript build failed in `src/query/queryAuth.ts` with:

`TS2345: Uint8Array<ArrayBufferLike> is not assignable to BufferSource`

## Cause

With the current Cloudflare Workers runtime typings and TypeScript 7,
an unqualified `Uint8Array` return type is widened to an
`ArrayBufferLike`-backed typed array. `crypto.subtle.verify()` expects
a `BufferSource` compatible with an `ArrayBuffer` backing store.

## Fix

The hexadecimal HMAC signature decoder now allocates an explicit
`ArrayBuffer`, fills it through a `Uint8Array` view, and passes the
`ArrayBuffer` itself to Web Crypto.

No HMAC algorithm, signing payload, tenant boundary, header name,
query canonicalization, timestamp window, or Query API route changed.

- Package: `0.11.1`
- Foundation: `07.5.11`
- Revision: `catalog-query-v1-fix-1`
