/**
 * Wire-payload sanitizers for the rid-keyed playground wire. Each sanitizer
 * narrows an `unknown` socket payload to a strictly-typed shape or returns
 * null. The router uses these at every wire boundary so a malformed payload
 * cannot leak unchecked into the binding table or runtime socket emit.
 *
 * **UI → Server**: `sanitizeExec`, `sanitizeWrite` validate payloads arriving
 * from the UI namespace before they are forwarded to the runtime.
 *
 * **Runtime → Server → UI**: `sanitizeChunk`, `sanitizeEnd`, `sanitizeError`
 * validate payloads arriving from the runtime before they are forwarded to
 * the originating UI socket. These mirror the UI-side guards in
 * `playground-guards.ts` for defense-in-depth — a compromised runtime cannot
 * inject arbitrary shapes into the UI store.
 */

import type { BindingTransport } from "./catalog/binding-table";

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

export interface PlaygroundExecPayload {
  rid: string;
  source: string;
  group: string;
  method: string;
  transport: BindingTransport;
  variables?: unknown;
  headers?: Record<string, string>;
}

export function sanitizeExec(raw: unknown): PlaygroundExecPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (
    typeof raw.source !== "string" ||
    typeof raw.group !== "string" ||
    typeof raw.method !== "string"
  ) {
    return null;
  }
  if (raw.transport !== "http" && raw.transport !== "sse" && raw.transport !== "ws") return null;
  if (hasDangerousKeys(raw.variables) || hasDangerousKeys(raw.headers)) return null;
  return {
    rid: raw.rid,
    source: raw.source,
    group: raw.group,
    method: raw.method,
    transport: raw.transport,
    variables: raw.variables,
    headers:
      raw.headers && typeof raw.headers === "object"
        ? (raw.headers as Record<string, string>)
        : undefined,
  };
}

/**
 * Reject objects whose own keys collide with `Object.prototype` slots so a
 * malicious wire payload cannot smuggle a `__proto__` / `constructor` /
 * `prototype` key into a downstream `Object.assign` / spread operation.
 */
export function hasDangerousKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (
    Object.hasOwn(value, "__proto__") ||
    Object.hasOwn(value, "constructor") ||
    Object.hasOwn(value, "prototype")
  );
}

export function sanitizeRidOnly(raw: unknown): { rid: string } | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  return { rid: raw.rid };
}

export interface PlaygroundWritePayload {
  rid: string;
  data: unknown;
}

/**
 * Validate `playground:write { rid, data }` arriving from the UI on the
 * rid-keyed wire. The `data` field is passed through to the runtime
 * responder unchanged — it represents an application-level WS message
 * the user is composing in the Studio playground — but the prototype-
 * pollution guard still fires because Socket.IO parses the JSON payload
 * on the runtime side and a crafted `__proto__` key could contaminate
 * downstream spread / merge operations inside the responder's WS
 * channel write path.
 */
export function sanitizeWrite(raw: unknown): PlaygroundWritePayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (!("data" in raw)) return null;
  if (hasDangerousKeys(raw.data)) return null;
  return { rid: raw.rid, data: raw.data };
}

// ---------------------------------------------------------------------------
// Runtime → Server → UI sanitizers
// ---------------------------------------------------------------------------

export type SanitizedChunk =
  | {
      kind: "http-result";
      status: number;
      data?: unknown;
      error?: string;
      headers?: Record<string, string>;
    }
  | { kind: "sse-event"; event: unknown }
  | { kind: "ws-message"; data: unknown };

export interface SanitizedChunkPayload {
  rid: string;
  chunk: SanitizedChunk;
}

export interface SanitizedEndPayload {
  rid: string;
  summary: { durationMs: number; count?: number };
}

export interface SanitizedErrorPayload {
  rid: string;
  error: { message: string };
}

function sanitizeChunkInner(raw: unknown): SanitizedChunk | null {
  if (!isPlainObject(raw) || hasDangerousKeys(raw)) return null;
  if (raw.kind === "http-result") {
    if (typeof raw.status !== "number" || !Number.isFinite(raw.status)) return null;
    return {
      kind: "http-result",
      status: raw.status,
      data: raw.data,
      ...(typeof raw.error === "string" && { error: raw.error }),
      ...(isStringRecord(raw.headers) && { headers: raw.headers }),
    };
  }
  if (raw.kind === "sse-event") {
    if (!("event" in raw)) return null;
    return { kind: "sse-event", event: raw.event };
  }
  if (raw.kind === "ws-message") {
    if (!("data" in raw)) return null;
    return { kind: "ws-message", data: raw.data };
  }
  return null;
}

/* Response headers, as the Playground shows them: names to string values. */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value) || hasDangerousKeys(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function sanitizeChunk(raw: unknown): SanitizedChunkPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  const chunk = sanitizeChunkInner(raw.chunk);
  if (!chunk) return null;
  return { rid: raw.rid, chunk };
}

export function sanitizeEnd(raw: unknown): SanitizedEndPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (!isPlainObject(raw.summary)) return null;
  const s = raw.summary;
  if (typeof s.durationMs !== "number" || !Number.isFinite(s.durationMs)) return null;
  const summary: SanitizedEndPayload["summary"] = { durationMs: s.durationMs };
  if (typeof s.count === "number" && Number.isFinite(s.count)) summary.count = s.count;
  return { rid: raw.rid, summary };
}

export function sanitizeError(raw: unknown): SanitizedErrorPayload | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.rid !== "string" || raw.rid.length === 0) return null;
  if (!isPlainObject(raw.error)) return null;
  if (typeof raw.error.message !== "string") return null;
  return { rid: raw.rid, error: { message: raw.error.message } };
}
