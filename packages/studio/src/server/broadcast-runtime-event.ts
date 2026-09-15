/**
 * Validated broadcast funnel for runtime events flowing into the UI namespace.
 *
 * Both the `/runtime` and `/app` namespaces emit mock-server lifecycle and
 * network-config events. This funnel is the canonical entry point — every
 * server-side caller goes through it so the wire format and downstream
 * filtering live in exactly one place.
 *
 * Only events whose `type` is in `RUNTIME_EVENT_WHITELIST` are forwarded;
 * unknown types are silently dropped with a warning log so a compromised
 * runtime cannot inject arbitrary event shapes into the UI store.
 */

import type { Namespace } from "socket.io";

/** Every event type the UI `handleMockEvent` dispatcher recognizes. */
const RUNTIME_EVENT_WHITELIST = new Set([
  "mock:server:connect",
  "mock:server:disconnect",
  "mock:route:list",
  "mock:store:snapshot",
  "mock:store:change",
  "mock:scenario:list",
  "mock:scenario:active",
  "mock:request:start",
  "mock:request:end",
  "mock:request:error",
  "mock:network:config",
  "mock:experiment:event",
]);

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate and sanitize a runtime event before broadcast. Returns a clean
 * object with dangerous keys stripped, or `undefined` when the event fails
 * validation (unknown type, missing serverId, non-plain-object).
 */
export function sanitizeRuntimeEvent(raw: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(raw)) return undefined;
  if (typeof raw.type !== "string" || !RUNTIME_EVENT_WHITELIST.has(raw.type)) return undefined;
  if (typeof raw.serverId !== "string" || raw.serverId.length === 0) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = value;
  }
  return result;
}

export function broadcastRuntimeEvent(
  uiNamespace: Namespace | undefined,
  raw: unknown,
  log: { warn: (msg: string) => void },
): void {
  if (!uiNamespace) return;
  const event = sanitizeRuntimeEvent(raw);
  if (!event) {
    const type = isPlainObject(raw) ? String(raw.type ?? "undefined") : "non-object";
    log.warn(`Rejected runtime event: type=${type}`);
    return;
  }
  uiNamespace.emit("event", event);
}
