/**
 * The payloads Studio sends a runtime's playground responder, and the checks
 * each one passes at the wire before the responder acts on it.
 */

export interface PlaygroundExecutePayload {
  rid: string;
  source: string;
  group: string;
  method: string;
  transport: "http" | "sse" | "ws";
  variables?: unknown;
  headers?: Record<string, string>;
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
  return {
    rid: r.rid,
    source: r.source,
    group: r.group,
    method: r.method,
    transport: r.transport,
    variables: r.variables,
    headers:
      r.headers && typeof r.headers === "object"
        ? (r.headers as Record<string, string>)
        : undefined,
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

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
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
