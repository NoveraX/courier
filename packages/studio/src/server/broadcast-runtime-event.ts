/**
 * Validated broadcast funnel for runtime events flowing into the UI namespace.
 *
 * Both the `/runtime` and `/app` namespaces emit mock-server lifecycle and
 * network-config events. This funnel is the canonical entry point — every
 * server-side caller goes through it so the wire format and downstream
 * filtering live in exactly one place.
 *
 * Only known types are forwarded, so a compromised runtime cannot inject
 * arbitrary event shapes into the UI store. There are two families, and they
 * carry different fields: a mock-server lifecycle event names the server it
 * came from, while a request-lifecycle event does not. Requiring `serverId` of
 * both is what silently dropped every request event a runtime ever sent, which
 * left Studio's Timeline, Waterfall, Analytics and Playground catalogue empty
 * while the application was plainly serving traffic.
 */

import type { Namespace } from "socket.io";

/** Mock-server lifecycle. Each names the server it came from. */
const MOCK_EVENTS = new Set([
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

/** What a runtime reports about the requests it serves. */
const RUNTIME_EVENTS = new Set([
  "request:start",
  "request:end",
  "request:error",
  "request:abort",
  "http:fetch:start",
  "http:fetch:end",
  "http:fetch:error",
  "proxy:receive",
  "proxy:parse",
  "proxy:respond",
  "middleware:enter",
  "middleware:exit",
  "middleware:error",
  "validation:start",
  "validation:pass",
  "validation:fail",
  "stream:open",
  "stream:message",
  "stream:close",
  "stream:error",
  "cache:hit",
  "cache:miss",
  "cache:store",
  "cache:invalidate",
  "dedup:reuse",
  "dedup:abort",
  "upload:progress",
  "upload:complete",
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
  if (typeof raw.type !== "string") return undefined;

  const isMock = MOCK_EVENTS.has(raw.type);
  if (!isMock && !RUNTIME_EVENTS.has(raw.type)) return undefined;

  /* Only a mock event names a server; asking a request event for one rejects
     every request event there is. */
  if (isMock && (typeof raw.serverId !== "string" || raw.serverId.length === 0)) {
    return undefined;
  }
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
