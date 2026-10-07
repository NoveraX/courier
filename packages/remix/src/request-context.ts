import { withWebRequestContext } from "@noverax/courier/node";

/**
 * React Router middleware that serves the rest of each request with its
 * session and headers at hand: every call a loader, an action or a step it
 * awaits makes takes them from the request — for the APIs that keep a
 * `session` or `forward` headers — and the session cookies the API sets
 * reach the browser on the response, a document's or a data request's.
 *
 * React Router 8 runs route middleware as it is; React Router 7 runs it
 * with `future.v8_middleware` set. It keeps the request in
 * `AsyncLocalStorage`, which Node provides, and Cloudflare with the
 * `nodejs_compat` flag. A server that hands React Router a `Request` alone,
 * as `react-router-serve` does, tells no client address.
 *
 * @returns The middleware, to list in the root route's `middleware`
 * @example
 * ```ts
 * // app/root.tsx
 * import { requestContext } from "@noverax/courier-remix/request-context";
 *
 * export const middleware = [requestContext()];
 * ```
 */
export function requestContext(): (
  args: { request: Request },
  next: () => Promise<Response>,
) => Promise<Response> {
  return ({ request }, next) => withWebRequestContext(request, next);
}

/**
 * A request handler that serves each request with the user's session at
 * hand — the handler `createRequestHandler` makes, served by a server of
 * the application's own: Bun's, Deno's, a Worker's. An Express server
 * serves it with `requestContext` from `@noverax/courier-express`, which
 * also tells the client's address.
 *
 * @param handler - The handler
 * @returns The handler, serving each request with its session at hand
 * @example
 * ```ts
 * import { createRequestHandler } from "react-router";
 * import { withRequestContext } from "@noverax/courier-remix/request-context";
 *
 * const handle = withRequestContext(createRequestHandler(build, "production"));
 * Bun.serve({ fetch: (request) => handle(request) });
 * ```
 */
export function withRequestContext<TRest extends unknown[]>(
  handler: (request: Request, ...rest: TRest) => Promise<Response>,
): (request: Request, ...rest: TRest) => Promise<Response> {
  return (request, ...rest) => withWebRequestContext(request, () => handler(request, ...rest));
}
