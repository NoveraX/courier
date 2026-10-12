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
import { emitLiveEvents } from "./live-events";

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
 * Pass a runtime's events to every Studio UI, in one message, once each is
 * validated. One that fails is left out, and said in the log.
 *
 * @param uiNamespace - The UI namespace, when Studio serves one
 * @param raws - The events as the runtime sent them, in order
 * @param log - Where a rejected event is noted
 * @returns The events as the UI was sent them; none when Studio serves no UI
 *
 * @example
 * ```ts
 * const sent = broadcastRuntimeEvents(uiNamespace, raws, log);
 * for (const event of sent) requestLog.record(event, socket.id);
 * ```
 */
export function broadcastRuntimeEvents(
  uiNamespace: Namespace | undefined,
  raws: readonly unknown[],
  log: { warn: (msg: string) => void },
): Record<string, unknown>[] {
  if (!uiNamespace) return [];
  const sent: Record<string, unknown>[] = [];
  for (const raw of raws) {
    const event = sanitizeRuntimeEvent(raw);
    if (event) {
      sent.push(event);
      continue;
    }
    const type = isPlainObject(raw) ? String(raw.type ?? "undefined") : "non-object";
    log.warn(`Rejected runtime event: type=${type}`);
  }
  emitLiveEvents(uiNamespace, sent);
  return sent;
}
