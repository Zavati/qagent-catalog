export class InvalidQueryCursorError extends Error {}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new InvalidQueryCursorError("Cursor is invalid.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new InvalidQueryCursorError("Cursor is invalid.");
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    throw new InvalidQueryCursorError("Cursor is invalid.");
  }
}

export function encodeQueryCursor<T extends Record<string, unknown>>(value: T): string {
  return base64UrlEncode(JSON.stringify({ v: 1, ...value }));
}

export function decodeQueryCursor<T extends Record<string, unknown>>(cursor: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(cursor));
  } catch (error) {
    if (error instanceof InvalidQueryCursorError) throw error;
    throw new InvalidQueryCursorError("Cursor is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as { v?: unknown }).v !== 1) {
    throw new InvalidQueryCursorError("Cursor version is invalid.");
  }
  return parsed as T;
}
