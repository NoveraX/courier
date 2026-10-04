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
import { hasDangerousKeys } from "./has-dangerous-keys";
import { isPlainObject } from "./is-plain-object";
import { type PlaygroundFormField, sanitizeForm } from "./playground-form";
import { isRuntimeId } from "./sanitize-runtime-events";

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
  /** The runtime that made the request a replay runs again, which runs it if it can. */
  runtimeId?: string;
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
  if (hasDangerousKeys(raw.variables)) return null;
  const headers = readHeaders(raw.headers);
  const form = sanitizeForm(raw.form);
  if (headers === null || form === null) return null;
  return {
    ...(form && { form }),
    rid: raw.rid,
    source: raw.source,
    group: raw.group,
    method: raw.method,
    transport: raw.transport,
    mode: raw.mode === "proxy" ? "proxy" : "direct",
    variables: raw.variables,
    ...(headers && { headers }),
    ...(isRuntimeId(raw.runtimeId) && { runtimeId: raw.runtimeId }),
  };
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

/* Header values reach the runtime's request as they are, so each is a
   string; anything else makes the payload malformed. */
function readHeaders(raw: unknown): Record<string, string> | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw) || hasDangerousKeys(raw)) return null;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "string") return null;
    headers[name] = value;
  }
  return headers;
}
