import {
  type ClientConnection,
  createHandler,
  type HandlerConfig,
  handleWhileConnected,
} from "@noverax/courier";

/**
 * The parts of SvelteKit's `RequestEvent` the handler reads. `platform.req`
 * is the Node request `@sveltejs/adapter-node` passes along.
 */
export interface SvelteKitRequestEvent {
  request: Request;
  platform?: { req?: { socket?: ClientConnection } };
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
 * @param config - Handler options, including the `allowedOrigins` the SSE
 *   transport checks against. Omit it to accept the defaults.
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
export function courierHandler(
  config?: HandlerConfig,
): (event: SvelteKitRequestEvent) => Promise<Response> {
  const { handle } = createHandler(config);
  return ({ request, platform }: SvelteKitRequestEvent) =>
    handleWhileConnected(handle, request, platform?.req?.socket);
}
