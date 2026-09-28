/**
 * Validated broadcast funnel for the events a runtime sends into the UI
 * namespace: the lifecycle of the requests, streams and channels it serves.
 * This funnel is the canonical entry point — every server-side caller goes
 * through it so the wire format and downstream filtering live in exactly one
 * place.
 *
 * Only known types are forwarded, so a compromised runtime cannot inject
 * arbitrary event shapes into the UI store. A managed mock's events do not
 * pass here: Studio's mock manager sends them to the UI itself.
 */

import { RUNTIME_EVENT_TYPES } from "@noverax/courier-studio-core/runtime";
import type { Namespace } from "socket.io";
import { isPlainObject } from "./is-plain-object";

/* Read from the package that emits them, so adding an event type in one
   place cannot silently start dropping it in the other. */
const RUNTIME_EVENTS = new Set(RUNTIME_EVENT_TYPES);

/**
 * Validate and sanitize a runtime event before broadcast. Returns a clean
 * object with dangerous keys stripped, or `undefined` when the event fails
 * validation (unknown type, non-plain-object).
 */
export function sanitizeRuntimeEvent(raw: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.type !== "string" || !RUNTIME_EVENTS.has(raw.type)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = value;
  }
  return result;
}

/**
 * Pass a runtime event to every Studio UI, once it is validated.
 *
 * @param uiNamespace - The UI namespace, when Studio serves one
 * @param raw - The event as the runtime sent it
 * @param log - Where a rejected event is noted
 * @returns The event as the UI was sent it, or `undefined` when it was not sent
 *
 * @example
 * ```ts
 * const sent = broadcastRuntimeEvent(uiNamespace, raw, log);
 * if (sent) requestLog.record(sent, socket.id);
 * ```
 */
export function broadcastRuntimeEvent(
  uiNamespace: Namespace | undefined,
  raw: unknown,
  log: { warn: (msg: string) => void },
): Record<string, unknown> | undefined {
  if (!uiNamespace) return undefined;
  const event = sanitizeRuntimeEvent(raw);
  if (!event) {
    const type = isPlainObject(raw) ? String(raw.type ?? "undefined") : "non-object";
    log.warn(`Rejected runtime event: type=${type}`);
    return undefined;
  }
  uiNamespace.emit("event", event);
  return event;
}
