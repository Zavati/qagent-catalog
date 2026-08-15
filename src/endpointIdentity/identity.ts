export const LOGICAL_ENDPOINT_IDENTITY_VERSION = "logical-endpoint-v1" as const;
export const LOGICAL_ENDPOINT_IDENTITY_STRATEGY = "SERVICE_METHOD_PATH" as const;

export interface LogicalEndpointIdentity {
  method: string;
  normalizedPath: string;
  endpointKey: string;
}

function normalizeMethod(value: string): string {
  const method = value.trim().toUpperCase();
  if (!method || method.length > 32) throw new Error("logical_endpoint_invalid_method");
  return method;
}

function normalizePath(value: string): string {
  const path = value.trim();
  if (!path || path.length > 4096) throw new Error("logical_endpoint_invalid_path");
  return path;
}

export function deriveLogicalEndpointIdentity(
  method: string,
  normalizedPath: string,
): LogicalEndpointIdentity {
  const normalizedMethod = normalizeMethod(method);
  const path = normalizePath(normalizedPath);

  return {
    method: normalizedMethod,
    normalizedPath: path,
    endpointKey: `${normalizedMethod} ${path}`,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function catalogEndpointIdFor(
  organizationId: string,
  projectId: string,
  serviceId: string,
  method: string,
  normalizedPath: string,
): Promise<string> {
  const identity = deriveLogicalEndpointIdentity(method, normalizedPath);
  const digest = await sha256Hex([
    LOGICAL_ENDPOINT_IDENTITY_VERSION,
    organizationId,
    projectId,
    serviceId,
    identity.method,
    identity.normalizedPath,
  ].join("\n"));

  return `cep_${digest.slice(0, 40)}`;
}

export async function catalogEndpointBindingIdFor(
  organizationId: string,
  projectId: string,
  endpointId: string,
  serviceHostId: string,
): Promise<string> {
  const digest = await sha256Hex([
    LOGICAL_ENDPOINT_IDENTITY_VERSION,
    organizationId,
    projectId,
    endpointId,
    serviceHostId,
  ].join("\n"));

  return `ceb_${digest.slice(0, 40)}`;
}
