export const SERVICE_IDENTITY_VERSION = "service-identity-v1" as const;
export const SERVICE_IDENTITY_STRATEGY = "HOST_EXACT" as const;

export interface ObservedHostIdentity {
  scheme: string;
  authority: string;
  hostname: string;
  port: string | null;
  serviceKey: string;
  displayName: string;
}

function normalizeScheme(value: string): string {
  return value.trim().toLowerCase();
}

export function deriveObservedHostIdentity(scheme: string, host: string): ObservedHostIdentity {
  const normalizedScheme = normalizeScheme(scheme);
  const rawHost = host.trim().toLowerCase().replace(/\.$/, "");

  if (!normalizedScheme || !rawHost) {
    throw new Error("service_identity_invalid_host");
  }

  let url: URL;
  try {
    url = new URL(`${normalizedScheme}://${rawHost}`);
  } catch {
    throw new Error("service_identity_invalid_host");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) throw new Error("service_identity_invalid_host");

  // Service identity v1 deliberately ignores scheme and port. The physical
  // binding keeps both, while the logical service stays stable when the same
  // host is observed through HTTPS/HTTP, alternate ports or environments.
  return {
    scheme: normalizedScheme,
    authority: url.host.toLowerCase(),
    hostname,
    port: url.port || null,
    serviceKey: `host:${hostname}`,
    displayName: hostname,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function serviceIdFor(
  organizationId: string,
  projectId: string,
  serviceKey: string,
): Promise<string> {
  const digest = await sha256Hex(
    [SERVICE_IDENTITY_VERSION, organizationId, projectId, serviceKey].join("\n"),
  );
  return `svc_${digest.slice(0, 40)}`;
}

export async function serviceHostIdFor(
  organizationId: string,
  projectId: string,
  environmentId: string,
  scheme: string,
  authority: string,
): Promise<string> {
  const digest = await sha256Hex(
    [
      SERVICE_IDENTITY_VERSION,
      organizationId,
      projectId,
      environmentId,
      scheme,
      authority,
    ].join("\n"),
  );
  return `svh_${digest.slice(0, 40)}`;
}
