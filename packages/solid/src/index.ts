import {
  type ClientConnection,
  createHandler,
  type HandlerConfig,
  handleWhileConnected,
} from "@noverax/courier";

/**
 * The parts of SolidStart's `APIEvent` the handler reads. `nativeEvent` is
 * the h3 event underneath, which on Node carries the response.
 */
export interface SolidAPIEvent {
  request: Request;
  nativeEvent?: { node?: { res?: ClientConnection } };
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
 * @param config - Handler options, including the `allowedOrigins` the SSE
 *   transport checks against. Omit it to accept the defaults.
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
export function courierHandler(
  config?: HandlerConfig,
): (event: SolidAPIEvent) => Promise<Response> {
  const { handle } = createHandler(config);
  return ({ request, nativeEvent }: SolidAPIEvent) =>
    handleWhileConnected(handle, request, nativeEvent?.node?.res);
}
