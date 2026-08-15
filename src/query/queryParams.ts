export class InvalidQueryParameterError extends Error {
  constructor(public readonly parameter: string, message: string) {
    super(message);
  }
}

export function parseLimit(params: URLSearchParams, fallback = 50, max = 100): number {
  const raw = params.get("limit");
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new InvalidQueryParameterError("limit", "limit must be an integer.");
  const limit = Number(raw);
  if (limit < 1 || limit > max) {
    throw new InvalidQueryParameterError("limit", `limit must be between 1 and ${max}.`);
  }
  return limit;
}

export function optionalEnum<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const raw = params.get(name);
  if (raw === null || raw === "") return undefined;
  if (!allowed.includes(raw as T)) {
    throw new InvalidQueryParameterError(name, `${name} has an unsupported value.`);
  }
  return raw as T;
}

export function optionalString(
  params: URLSearchParams,
  name: string,
  maxLength = 160,
): string | undefined {
  const raw = params.get(name)?.trim();
  if (!raw) return undefined;
  if (raw.length > maxLength) {
    throw new InvalidQueryParameterError(name, `${name} exceeds ${maxLength} characters.`);
  }
  return raw;
}

export function optionalInteger(
  params: URLSearchParams,
  name: string,
  min: number,
  max: number,
): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw === "") return undefined;
  if (!/^\d+$/.test(raw)) throw new InvalidQueryParameterError(name, `${name} must be an integer.`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new InvalidQueryParameterError(name, `${name} must be between ${min} and ${max}.`);
  }
  return value;
}

export function optionalTimestamp(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name)?.trim();
  if (!raw) return undefined;
  if (!Number.isFinite(Date.parse(raw))) {
    throw new InvalidQueryParameterError(name, `${name} must be an ISO-8601 timestamp.`);
  }
  return raw;
}
