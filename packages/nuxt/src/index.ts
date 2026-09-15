import type { HandlerConfig } from "@noverax/nexus";
import { createHandler } from "@noverax/nexus";
import { fromWebHandler } from "h3";

/**
 * Create a Nuxt/h3/Nitro event handler for the nexus proxy.
 *
 * Only HTTP request/response is supported by this adapter. Realtime
 * transports (SSE and WebSocket) are intentionally NOT exposed here:
 * Nitro/H3's WebSocket layer (crossws) is still flagged experimental and
 * its production behavior across deployment targets (node-server, bun,
 * cloudflare, vercel-edge) is not yet stable. Once Nitro/H3 ship a
 * production-grade WS API, `nexusSSEHandler` and `nexusWSAttach` will be
 * added here in parallel with the other 5 framework adapters.
 *
 * In the meantime, run a standalone Nexus server alongside Nuxt for any
 * SSE/WS endpoints — see the deployment docs for the standalone server.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in a Nuxt server
 * plugin (`server/plugins/nexus.ts`) before the first request.
 *
 * @example
 * ```ts
 * // server/api/request.ts (Nuxt 3+)
 * import { nexusHandler } from "@noverax/nexus-nuxt";
 * export default nexusHandler();
 * ```
 */
export function nexusHandler(config?: HandlerConfig) {
  const { handle } = createHandler(config);
  return fromWebHandler((request) => handle(request));
}
