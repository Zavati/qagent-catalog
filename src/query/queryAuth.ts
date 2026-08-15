export const CATALOG_QUERY_AUTH_VERSION = "qagent.catalog-query.v1" as const;

export interface CatalogQueryTenantContext {
  organizationId: string;
  projectId: string;
}

export class CatalogQueryAuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function canonicalizeQuery(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function buildCatalogQuerySigningPayload(
  request: Pick<Request, "method" | "url">,
  tenant: CatalogQueryTenantContext,
  timestamp: string,
): string {
  const url = new URL(request.url);
  return [
    CATALOG_QUERY_AUTH_VERSION,
    request.method.toUpperCase(),
    url.pathname,
    canonicalizeQuery(url.searchParams),
    tenant.organizationId,
    tenant.projectId,
    timestamp,
  ].join("\n");
}

async function verifyHmac(secret: string, payload: string, signatureHex: string): Promise<boolean> {
  const signature = hexToBytes(signatureHex);
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(payload),
  );
}

export async function authorizeCatalogQuery(
  request: Request,
  env: Env,
  expectedProjectId?: string,
  nowMs = Date.now(),
): Promise<CatalogQueryTenantContext> {
  const secret = env.CATALOG_QUERY_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new CatalogQueryAuthError(
      503,
      "QUERY_AUTH_NOT_CONFIGURED",
      "Catalog Query API authentication is not configured.",
    );
  }

  const organizationId = request.headers.get("x-qagent-organization-id")?.trim() ?? "";
  const projectId = request.headers.get("x-qagent-project-id")?.trim() ?? "";
  const timestamp = request.headers.get("x-qagent-query-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-qagent-query-signature")?.trim() ?? "";

  if (!organizationId || !projectId || !timestamp || !signature) {
    throw new CatalogQueryAuthError(401, "QUERY_AUTH_REQUIRED", "Signed tenant context is required.");
  }
  if (!isSafeId(organizationId) || !isSafeId(projectId)) {
    throw new CatalogQueryAuthError(401, "INVALID_TENANT_CONTEXT", "Tenant context is invalid.");
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
    throw new CatalogQueryAuthError(401, "INVALID_QUERY_TIMESTAMP", "Query timestamp is invalid.");
  }

  const configuredSkew = Number(env.CATALOG_QUERY_MAX_SKEW_SECONDS ?? "300");
  const maxSkewSeconds = Number.isFinite(configuredSkew)
    ? Math.min(Math.max(Math.trunc(configuredSkew), 30), 900)
    : 300;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > maxSkewSeconds) {
    throw new CatalogQueryAuthError(401, "QUERY_SIGNATURE_EXPIRED", "Query signature is outside the allowed time window.");
  }

  const tenant = { organizationId, projectId } satisfies CatalogQueryTenantContext;
  const payload = buildCatalogQuerySigningPayload(request, tenant, timestamp);
  const valid = await verifyHmac(secret, payload, signature);
  if (!valid) {
    throw new CatalogQueryAuthError(401, "INVALID_QUERY_SIGNATURE", "Query signature is invalid.");
  }
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new CatalogQueryAuthError(403, "PROJECT_SCOPE_MISMATCH", "Signed project does not match route scope.");
  }

  return tenant;
}

export async function createCatalogQuerySignature(
  secret: string,
  request: Pick<Request, "method" | "url">,
  tenant: CatalogQueryTenantContext,
  timestamp: string,
): Promise<string> {
  const payload = buildCatalogQuerySigningPayload(request, tenant, timestamp);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}
