/**
 * How the request log reads runtime events: which request an event belongs
 * to, which events open and end one, and the event that ends a request its
 * runtime left open.
 */

type RuntimeEvent = Record<string, unknown>;

const OPENING = new Set(["request:start", "stream:open"]);
const CLOSING = new Set(["request:end", "request:error", "stream:close", "stream:error"]);

/** What the UI is told about a request its runtime went away from. */
export const RUNTIME_GONE =
  "The runtime disconnected before this request finished, so how it ended is not known.";

/**
 * The request an event belongs to: `request:start` names it `id`, every
 * other request event `requestId`.
 *
 * @param event - A runtime event
 * @returns The request id, or `undefined` for an event that names none
 *
 * @example
 * ```ts
 * requestIdOf({ type: "request:end", requestId: "r1" }); // "r1"
 * ```
 */
export function requestIdOf(event: RuntimeEvent): string | undefined {
  const id = event.type === "request:start" ? event.id : event.requestId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** Whether the event starts a request or a stream. */
export function isOpening(event: RuntimeEvent): boolean {
  return typeof event.type === "string" && OPENING.has(event.type);
}

/** Whether the event ends a request or a stream. */
export function isClosing(event: RuntimeEvent): boolean {
  return typeof event.type === "string" && CLOSING.has(event.type);
}

/**
 * The event that ends a request its runtime left open: a stream fails, a
 * request fails, each saying why.
 *
 * @param requestId - The request to end
 * @param opening - The event that opened it
 * @returns The event to pass to the UI
 *
 * @example
 * ```ts
 * closingEvent("s1", { type: "stream:open", sessionId: "server" }).type; // "stream:error"
 * ```
 */
export function closingEvent(requestId: string, opening: RuntimeEvent): RuntimeEvent {
  const base = { id: requestId, requestId, timestamp: Date.now(), sessionId: opening.sessionId };
  if (opening.type === "stream:open") return { ...base, type: "stream:error", error: RUNTIME_GONE };
  return { ...base, type: "request:error", error: { type: "unknown", message: RUNTIME_GONE } };
}
