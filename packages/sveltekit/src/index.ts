import {
  type ClientConnection,
  type ConnectResult,
  createHandler,
  type HandlerConfig,
  handleWhileConnected,
} from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import { rememberPeerAddress } from "@noverax/courier/internal";

import { svelteKitClientAddress } from "./client-address";

export {
  type SvelteKitServerEvent,
  svelteKitIncomingRequest,
  svelteKitRequestContext,
} from "./request-context";

/**
 * The parts of SvelteKit's `RequestEvent` the handler reads. `platform.req`
 * is the Node request `@sveltejs/adapter-node` passes along.
 */
export interface SvelteKitRequestEvent {
  request: Request;
  platform?: { req?: { socket?: ClientConnection } };
  /** The address the adapter reports the request came from. */
  getClientAddress?: (() => string) | undefined;
}

/**
 * Create a SvelteKit request handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * SvelteKit's request signal fires only while the body is still uploading,
 * so a call the browser cancels later would run to completion upstream.
 * Under `@sveltejs/adapter-node` the handler watches the client's socket
 * instead and stops the upstream call when it closes. The Vite dev server
 * exposes no connection, so there a cancelled call still runs to the end.
 *
 * On its first request it tells an attached Studio which sources it serves,
 * so the Playground can run them in this process.
 *
 * @param config - Handler options, including the `allowedOrigins` whose pages
 *   may call the proxy: every call and every stream is checked against them.
 *   Omit it to accept the defaults.
 * @returns A handler for the route's `GET` and `POST` exports
 *
 * @example
 * ```ts
 * // src/routes/api/request/+server.ts
 * import { courierHandler } from "@noverax/courier-sveltekit";
 *
 * const handler = courierHandler();
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function courierHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): (event: SvelteKitRequestEvent) => Promise<Response> {
  const { handle } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http", "sse"], framework: "sveltekit" });
  return (event: SvelteKitRequestEvent) => {
    announce();
    rememberPeerAddress(event.request, svelteKitClientAddress(event));
    return handleWhileConnected(handle, event.request, event.platform?.req?.socket);
  };
}
