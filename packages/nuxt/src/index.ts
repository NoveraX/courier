import type { HandlerConfig } from "@noverax/courier";
import { createHandler } from "@noverax/courier";
import type { EventHandler } from "h3";
import { fromWebHandler } from "h3";

/**
 * Create a Nuxt/h3/Nitro event handler for the courier proxy.
 *
 * Only HTTP request/response is supported by this adapter. Realtime
 * transports (SSE and WebSocket) are intentionally NOT exposed here:
 * Nitro/H3's WebSocket layer (crossws) is still flagged experimental and
 * its production behavior across deployment targets (node-server, bun,
 * cloudflare, vercel-edge) is not yet stable. Once Nitro/H3 ship a
 * production-grade WS API, `courierSSEHandler` and `courierWSAttach` will be
 * added here in parallel with the other 5 framework adapters.
 *
 * In the meantime, run a standalone Courier server alongside Nuxt for any
 * SSE/WS endpoints — see the deployment docs for the standalone server.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in a Nuxt server
 * plugin (`server/plugins/courier.ts`) before the first request.
 *
 * @example
 * ```ts
 * // server/api/request.ts (Nuxt 3+)
 * import { courierHandler } from "@noverax/courier-nuxt";
 * export default courierHandler();
 * ```
 */
export function courierHandler(config?: HandlerConfig): EventHandler {
  const { handle } = createHandler(config);
  return fromWebHandler((request) => handle(request));
}
