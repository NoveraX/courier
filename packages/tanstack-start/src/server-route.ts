import type { announceWhenRegistered } from "@noverax/courier/announce";
import { discardBody, rememberPeerAddress, serverOriginOf } from "@noverax/courier/internal";

import { connectionOf } from "./connection";

/** What TanStack Start hands a server route's handler, as far as the proxy reads it. */
export interface ServerRouteContext {
  /** The request being served */
  readonly request: Request;
}

/** A handler of a server route, as `createFileRoute(path)({ server: { handlers } })` takes it. */
export type ServerRouteHandler = (context: ServerRouteContext) => Response | Promise<Response>;

/**
 * A handler that serves a route's requests with one of the proxy's entry
 * points, once the core knows where each came from and Studio, where the
 * server listens.
 *
 * @param entry - The entry point of the core's handler
 * @param announce - What tells Studio the sources the route serves
 * @returns The handler
 * @example
 * ```ts
 * const GET = served(handleGet, announceWhenRegistered({ transports: ["http"], framework: "tanstack-start" }));
 * ```
 */
export function served(
  entry: (request: Request) => Promise<Response>,
  announce: ReturnType<typeof announceWhenRegistered>,
): ServerRouteHandler {
  return ({ request }) => {
    const { socket, address } = connectionOf(request);
    rememberPeerAddress(request, address);
    announce(serverOriginOf(socket));
    return entry(request);
  };
}

/**
 * The handler of the methods a route serves none of: 405, with the ones it
 * serves in `Allow`, as a framework answers for a route that exports no
 * handler for the method. TanStack Start renders the application's page
 * for such a method instead, which a route of the proxy must not answer
 * with. The body is taken off the connection, as the core's own refusals
 * take it.
 *
 * @param allowed - The methods the route serves
 * @returns The handler, for the route's `ANY`
 * @example
 * ```ts
 * const ANY = methodNotAllowed(["GET", "OPTIONS"]);
 * ```
 */
export function methodNotAllowed(allowed: readonly string[]): ServerRouteHandler {
  const allow = allowed.join(", ");
  return ({ request }) => {
    discardBody(request);
    return new Response(null, { status: 405, headers: { allow } });
  };
}
