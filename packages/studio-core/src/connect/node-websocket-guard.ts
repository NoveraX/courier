/**
 * Runtime guard for Node.js < 21 — checks whether `globalThis.WebSocket`
 * is available before the Studio Playground proxy WS executor tries to
 * use it.
 *
 * # Why this exists
 *
 * Node 21 ships a global `WebSocket` constructor as a Web API parity. On
 * older Node versions, the global is `undefined` and the underlying
 * `ws-connection` module's `new WebSocket(url)` call throws a generic
 * `ReferenceError` deep inside the connection loop — far away from the
 * actual root cause and impossible for the user to map back to "upgrade
 * Node or run nexus-server".
 *
 * Surfacing this loudly at the boundary, with a copy-pasteable remediation
 * pointer, turns a confusing crash into a one-line fix.
 *
 * # When called
 *
 * `playground-ws-executor.ts:executeProxyWS` calls this exactly once per
 * Subscribe click, *before* invoking the proxy factory. If it returns a
 * non-undefined `ConfigurationError`, the executor surfaces it via
 * `studioHooks.onStreamError` and aborts cleanly without ever attempting
 * a real connection.
 */

import { ConfigurationError } from "@noverax/nexus";

/**
 * Detect whether the current runtime exposes a global `WebSocket` constructor.
 *
 * @returns `undefined` when WebSocket is available, or a `ConfigurationError`
 *   with code `NODE_WEBSOCKET_UNAVAILABLE` describing how to fix it.
 */
export function assertGlobalWebSocket(): ConfigurationError | undefined {
  const ws = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof ws === "function") return undefined;
  return new ConfigurationError(
    "NODE_WEBSOCKET_UNAVAILABLE",
    [
      "[nexus] Studio Playground proxy mode (WS) requires a global `WebSocket`",
      "constructor in the runtime.",
      "",
      "Node ≥21 ships one natively. On older Node versions you must either:",
      "  • upgrade to Node ≥21, or",
      "  • run `@noverax/nexus-server` separately for the WS endpoints and",
      "    point `proxyPath.ws` at it (the standalone server uses the `ws`",
      "    package and works on every supported Node version).",
      "",
      "See https://nexus.noverax.com/docs/deployment/standalone-server",
    ].join("\n"),
  );
}
