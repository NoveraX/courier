import { announceWhenRegistered } from "@noverax/courier/announce";
import { type ConnectResult, createHandler, type HandlerConfig } from "@noverax/courier/server";

import { methodNotAllowed, type ServerRouteHandler, served } from "./server-route";

/** The handlers `apiRoute()` gives a server route, by the methods TanStack Start names them with. */
export interface ApiRouteHandlers {
  /** A read, its variables in the address */
  readonly GET: ServerRouteHandler;
  /** A write, its variables in the body */
  readonly POST: ServerRouteHandler;
  /** A preflight from a page `allowedOrigins` lists; any other is refused */
  readonly OPTIONS: ServerRouteHandler;
  /** Any other method: 405 */
  readonly ANY: ServerRouteHandler;
}

/**
 * The handlers of the server route TanStack Start serves Courier's proxy
 * from — `/api/request`, where a proxy client sends its calls unless its
 * `proxyPath` names another: a read over GET, a write over POST, and the
 * preflight of a page `allowedOrigins` lists over OPTIONS. Any other method
 * is refused with 405, which TanStack Start would otherwise answer with the
 * application's page. Streams have a route of their own, `sseRoute()`.
 *
 * Sources are read from the core's registry, filled by `registerSources()`
 * in a server module, unless `config.sources` names them. On its first
 * request the route tells an attached Studio which sources it serves and
 * where the server listens.
 *
 * @param config - Handler options, including the `allowedOrigins` whose pages
 *   may call the proxy: every call is checked against them. Omit it to accept
 *   the defaults.
 * @returns The handlers, for the route's `server.handlers`
 * @example
 * ```ts
 * // src/routes/api/request.ts
 * import { createFileRoute } from "@tanstack/react-router";
 * import { apiRoute } from "@noverax/courier-tanstack-start";
 *
 * export const Route = createFileRoute("/api/request")({ server: { handlers: apiRoute() } });
 * ```
 */
export function apiRoute<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): ApiRouteHandlers {
  const { handle, handleGet, handlePost } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http"], framework: "tanstack-start" });
  return {
    GET: served(handleGet, announce),
    POST: served(handlePost, announce),
    OPTIONS: ({ request }) => handle(request),
    ANY: methodNotAllowed(["GET", "POST", "OPTIONS"]),
  };
}
