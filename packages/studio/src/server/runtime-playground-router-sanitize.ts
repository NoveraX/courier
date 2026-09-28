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
import { type PlaygroundFormField, sanitizeForm } from "./playground-form";

export function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto: unknown = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

export interface PlaygroundExecPayload {
  rid: string;
  source: string;
  group: string;
  method: string;
  transport: BindingTransport;
  /** Whether the runtime calls the endpoint itself or through the app's proxy route */
  mode: "direct" | "proxy";
  variables?: unknown;
  headers?: Record<string, string>;
  /** A form to send as the body, in place of the variables */
  form?: PlaygroundFormField[];
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
  const form = sanitizeForm(raw.form);
  if (form === null) return null;
  return {
    ...(form && { form }),
    rid: raw.rid,
    source: raw.source,
    group: raw.group,
    method: raw.method,
    transport: raw.transport,
    mode: raw.mode === "proxy" ? "proxy" : "direct",
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
