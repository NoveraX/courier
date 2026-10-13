import {
  type ClientConnection,
  type ConnectResult,
  createHandler,
  type HandlerConfig,
  handleWhileConnected,
} from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import { rememberPeerAddress } from "@noverax/courier/internal";

export {
  type SolidStartServerEvent,
  solidStartIncomingRequest,
  solidStartRequestContext,
} from "./request-context";

/**
 * The parts of SolidStart's `APIEvent` the handler reads. `nativeEvent` is
 * the h3 event underneath, which on Node carries the response.
 */
export interface SolidAPIEvent {
  request: Request;
  nativeEvent?: { node?: { res?: ClientConnection } };
  /** The address SolidStart reports the request came from. */
  clientAddress?: string | undefined;
}

/**
 * Create a Solid Start API route handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * SolidStart's dev server builds the request without a signal that fires
 * when the browser leaves, so a call the browser cancelled would run to
 * completion upstream. The handler also watches the Node response on the
 * event and stops the upstream call when the client goes away.
 *
 * @param config - Handler options, including the `allowedOrigins` whose pages
 *   may call the proxy: every call and every stream is checked against them.
 *   Omit it to accept the defaults.
 * @returns A handler for the route's `GET` and `POST` exports
 *
 * @example
 * ```ts
 * // src/routes/api/request.ts
 * import { courierHandler } from "@noverax/courier-solid";
 *
 * const handler = courierHandler();
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function courierHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): (event: SolidAPIEvent) => Promise<Response> {
  const { handle } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http", "sse"], framework: "solid" });
  return ({ request, nativeEvent, clientAddress }: SolidAPIEvent) => {
    announce(new URL(request.url).origin);
    rememberPeerAddress(request, clientAddress);
    return handleWhileConnected(handle, request, nativeEvent?.node?.res);
  };
}
