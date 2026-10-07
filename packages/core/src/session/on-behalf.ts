import type { IncomingRequest } from "./incoming-request";

const served = new WeakMap<Request, IncomingRequest>();

/**
 * Mark a proxy request made in the server's own process as made for the
 * request being served — a proxy caller called while a page renders. The
 * proxy then takes the session from that request, guards its writes by it,
 * and hands the cookies the API sets to its response rather than to its own.
 *
 * @param request - The proxy request, made in process
 * @param incoming - The request it is made for
 * @example
 * ```ts
 * serveOnBehalf(proxyRequest, incoming);
 * await handler.handle(proxyRequest);
 * ```
 */
export function serveOnBehalf(request: Request, incoming: IncomingRequest): void {
  served.set(request, incoming);
}

/**
 * The request a proxy request was made in process for, if it was.
 *
 * @param request - The proxy request
 * @returns The request being served, or `undefined`
 * @example
 * ```ts
 * onBehalfOf(context.req)?.origin; // "https://app.example.com"
 * ```
 */
export function onBehalfOf(request: Request | undefined): IncomingRequest | undefined {
  return request === undefined ? undefined : served.get(request);
}
