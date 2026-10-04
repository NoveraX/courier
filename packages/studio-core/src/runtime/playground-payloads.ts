/**
 * The payloads Studio sends a runtime's playground responder, and the checks
 * each one passes at the wire before the responder acts on it.
 */

import { type PlaygroundFormField, readPlaygroundForm } from "./playground-form";
export interface PlaygroundExecutePayload {
  rid: string;
  source: string;
  group: string;
  method: string;
  transport: "http" | "sse" | "ws";
  /** Whether the call is made in this process or through the app's proxy route */
  mode: "direct" | "proxy";
  variables?: unknown;
  headers?: Record<string, string> | undefined;
  /** A form to send as the body, in place of the variables */
  form?: PlaygroundFormField[];
}

export interface PlaygroundCancelPayload {
  rid: string;
}

export interface PlaygroundWritePayload {
  rid: string;
  data: unknown;
}

/**
 * Read a `playground:execute` payload.
 *
 * @param raw - What arrived on the socket
 * @returns The payload, or `null` when it is malformed or carries dangerous keys
 * @example
 * ```ts
 * sanitizeExecute({ rid: "r1", source: "api", group: "users", method: "list", transport: "http" });
 * ```
 */
export function sanitizeExecute(raw: unknown): PlaygroundExecutePayload | null {
  if (!isPlainObject(raw)) return null;
  const r = raw;
  if (typeof r.rid !== "string" || r.rid.length === 0) return null;
  if (typeof r.source !== "string" || typeof r.group !== "string" || typeof r.method !== "string") {
    return null;
  }
  if (r.transport !== "http" && r.transport !== "sse" && r.transport !== "ws") return null;
  if (hasDangerousKeys(r.variables) || hasDangerousKeys(r.headers)) return null;
  const form = readPlaygroundForm(r.form);
  if (form === null) return null;
  return {
    ...(form && { form }),
    rid: r.rid,
    source: r.source,
    group: r.group,
    method: r.method,
    transport: r.transport,
    mode: r.mode === "proxy" ? "proxy" : "direct",
    variables: r.variables,
    headers: headersOf(r.headers),
  };
}

/**
 * Read a `playground:cancel` payload.
 *
 * @param raw - What arrived on the socket
 * @returns The payload, or `null` without a request id
 * @example
 * ```ts
 * sanitizeRid({ rid: "r1" }); // → { rid: "r1" }
 * ```
 */
export function sanitizeRid(raw: unknown): PlaygroundCancelPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  return { rid: raw.rid };
}

/**
 * Read a `playground:write` payload.
 *
 * @param raw - What arrived on the socket
 * @returns The payload, or `null` when it is malformed or carries dangerous keys
 * @example
 * ```ts
 * sanitizeWrite({ rid: "r1", data: { text: "hi" } });
 * ```
 */
export function sanitizeWrite(raw: unknown): PlaygroundWritePayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (hasDangerousKeys(raw.data)) return null;
  return { rid: raw.rid, data: raw.data };
}

/* Header values arrive as text: a value of another type is not a header, and
   an array — which `new Headers()` reads as name and value pairs — is not a
   map of them. */
function headersOf(raw: unknown): Record<string, string> | undefined {
  if (!isPlainObject(raw)) return undefined;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string") headers[name] = value;
  }
  return headers;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto: unknown = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

/** Defensive prototype-pollution guard at the wire boundary. */
function hasDangerousKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (
    Object.hasOwn(value, "__proto__") ||
    Object.hasOwn(value, "constructor") ||
    Object.hasOwn(value, "prototype")
  );
}
