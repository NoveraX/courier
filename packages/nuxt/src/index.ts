import type { ConnectResult, HandlerConfig } from "@noverax/courier";
import { createHandler, handleWhileConnected } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";

import { connectionOf } from "./event-connection";
import { requestOfEvent } from "./event-request";
import type { CourierEventHandler, H3EventLike } from "./h3-event";

export type { CourierEventHandler, H3EventLike, H3NodeEvent, H3WebEvent } from "./h3-event";
export { type NitroAppLike, nuxtIncomingRequest, requestContextPlugin } from "./request-context";

/**
 * Create a Nuxt/Nitro event handler for the courier proxy.
 *
 * The route serves proxied HTTP calls and SSE streams alike: a request that
 * asks for `text/event-stream` gets a stream. Point the client's
 * `proxyPath.http` — and `proxyPath.sse`, for streams — at the route.
 * WebSocket channels are not served here, because Nitro's WebSocket layer is
 * still experimental; run the standalone Courier server for those.
 *
 * The handler works with the h3 Nitro runs, whichever major that is — h3 1.x
 * in Nuxt 3 and 4 — without importing h3 itself, so the version a package
 * manager resolves for this package never has to match Nitro's.
 *
 * A call the browser cancels stops the upstream call too: the request handed
 * to the proxy follows the client's connection, whichever h3 built it.
 *
 * Sources are read at request time from the core global registry — register
 * them in a Nitro server plugin (`server/plugins/courier.ts`), or call
 * `await attachRuntime()` there to load them from `courier.config.ts`.
 *
 * On its first request it tells an attached Studio which sources it serves,
 * so the Playground can run them in this process.
 *
 * @param config - Handler options, such as `allowedOrigins` or body limits
 * @returns An h3 event handler to export from a server route
 *
 * @example
 * ```ts
 * // server/api/request.ts
 * import { courierHandler } from "@noverax/courier-nuxt";
 * export default courierHandler();
 * ```
 */
export function courierHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): CourierEventHandler {
  const { handle } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http", "sse"], framework: "nuxt" });
  const handler = async (event: H3EventLike): Promise<Response> => {
    const request = await requestOfEvent(event);
    announce(new URL(request.url).origin);
    return handleWhileConnected(handle, request, connectionOf(event));
  };
  return Object.assign(handler, { __is_handler__: true } as const);
}
