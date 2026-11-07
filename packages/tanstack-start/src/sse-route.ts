import { announceWhenRegistered } from "@noverax/courier/announce";
import { type ConnectResult, createHandler, type HandlerConfig } from "@noverax/courier/server";

import { methodNotAllowed, type ServerRouteHandler, served } from "./server-route";

/** The handlers `sseRoute()` gives a server route, by the methods TanStack Start names them with. */
export interface SseRouteHandlers {
  /** A stream, its variables in the address */
  readonly GET: ServerRouteHandler;
  /** A preflight from a page `allowedOrigins` lists; any other is refused */
  readonly OPTIONS: ServerRouteHandler;
  /** Any other method: 405 */
  readonly ANY: ServerRouteHandler;
}

/**
 * The handlers of the server route TanStack Start serves Courier's streams
 * of server-sent events from — `/api/sse`, where a proxy client opens them
 * unless its `proxyPath` names another: a stream over GET, and the
 * preflight of a page `allowedOrigins` lists over OPTIONS. Any other method
 * is refused with 405, which TanStack Start would otherwise answer with the
 * application's page.
 *
 * A stream ends upstream when its browser goes: the servers TanStack Start
 * runs on — its dev server, `vite preview`, Nitro — end the request's
 * signal when the client leaves. Sources are read as `apiRoute()` reads
 * them, and Studio is told the route serves their streams.
 *
 * @param config - Handler options, including the `allowedOrigins` whose pages
 *   may open streams. Omit it to accept the defaults.
 * @returns The handlers, for the route's `server.handlers`
 * @example
 * ```ts
 * // src/routes/api/sse.ts
 * import { createFileRoute } from "@tanstack/react-router";
 * import { sseRoute } from "@noverax/courier-tanstack-start";
 *
 * export const Route = createFileRoute("/api/sse")({ server: { handlers: sseRoute() } });
 * ```
 */
export function sseRoute<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): SseRouteHandlers {
  const { handle, handleSSE } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["sse"], framework: "tanstack-start" });
  return {
    GET: served(handleSSE, announce),
    OPTIONS: ({ request }) => handle(request),
    ANY: methodNotAllowed(["GET", "OPTIONS"]),
  };
}
