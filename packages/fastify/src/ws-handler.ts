import { announceWhenRegistered } from "@noverax/courier/announce";
import {
  answerTransportRequest,
  DEFAULT_WS_MAX_MESSAGE_SIZE,
  serverOriginOf,
  toWebRequest,
  wsFrameLimit,
} from "@noverax/courier/node";
import type {
  ConnectResult,
  WebSocketLike,
  WSHandlerConfig,
  WSHandlerDescriptor,
} from "@noverax/courier/server";
import { ConfigurationError, createLogger, createWSHandler } from "@noverax/courier/server";
import type { FastifyRequest, RouteShorthandOptionsWithHandler } from "fastify";

const log = createLogger("Fastify");

/**
 * What `courierWSHandler` returns: the route handler for `{ websocket: true }`
 * routes, carrying the handler's `connections`, its `destroy({ timeoutMs })`,
 * its `stats()`, and `http`, the route of its HTTP transport.
 */
export type CourierWSRoute = ((socket: WebSocketLike, request: FastifyRequest) => void) &
  WSHandlerDescriptor & {
    /**
     * The route of the HTTP transport, for `POST` on the socket's path —
     * `fastify.post("/api/ws", ws.http)`: a client whose network lets no
     * WebSocket through keeps the same connection over requests there. Each
     * is answered from the route's `onRequest`, its reply hijacked, so no body
     * parser of Fastify's reads it and no later hook runs; the application's
     * own `onRequest` hooks see it, as they see the upgrade.
     */
    readonly http: RouteShorthandOptionsWithHandler;
  };

/**
 * Create a Fastify WebSocket route handler for Courier realtime.
 *
 * It runs on `@fastify/websocket`, which must be registered first; called
 * without it, the route answers 500 with an error that says so.
 *
 * The plugin's `ws` server reads each frame whole before the handler sees
 * it, up to its own `maxPayload` — 100 MiB unless the plugin is registered
 * with another. Register it with `options: { maxPayload: wsFrameLimit() }`,
 * the frame limit the Express and Nest adapters use: a message somewhat over
 * `maxMessageSize` is refused with 4413 and the socket kept, and a frame
 * larger still is refused before it is read. The handler warns once when the
 * plugin would read more.
 *
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Route handler for `{ websocket: true }` routes, carrying the
 *   handler's `connections`, its `destroy({ timeoutMs })` — call it from a
 *   `preClose` hook, so the handler's connections are closed and its pub/sub
 *   subscriptions let go of before the server waits on its requests — its
 *   `stats()`, and `http`, the route of its HTTP transport
 *
 * @example
 * ```ts
 * import fastifyWebsocket from "@fastify/websocket";
 * import { wsFrameLimit } from "@noverax/courier/node";
 * import { courierWSHandler } from "@noverax/courier-fastify";
 *
 * await fastify.register(fastifyWebsocket, { options: { maxPayload: wsFrameLimit() } });
 * const ws = courierWSHandler();
 * fastify.get("/api/ws", { websocket: true }, ws);
 * fastify.post("/api/ws", ws.http);
 * fastify.addHook("preClose", () => ws.destroy());
 * ```
 */
export function courierWSHandler<TConnect extends ConnectResult = ConnectResult>(
  options?: WSHandlerConfig<TConnect>,
): CourierWSRoute {
  const wsHandler = createWSHandler(options);
  const maxMessageSize = options?.maxMessageSize ?? DEFAULT_WS_MAX_MESSAGE_SIZE;
  let checkedPayloadLimit = false;
  const announce = announceWhenRegistered({ transports: ["ws"], framework: "fastify" });

  const route = (socket: unknown, request: FastifyRequest) => {
    if (!isSocket(socket)) throw pluginMissing();
    announce(serverOriginOf(request.raw.socket));
    if (!checkedPayloadLimit) {
      checkedPayloadLimit = true;
      warnOnLargerPayloads(request.server, maxMessageSize);
    }
    wsHandler.handleSocket(socket, toWebRequest(request.raw));
  };

  const http: RouteShorthandOptionsWithHandler = {
    onRequest: (request, reply, done) => {
      reply.hijack();
      answerTransportRequest(request.raw, reply.raw, wsHandler, () =>
        announce(serverOriginOf(request.raw.socket)),
      );
      done();
    },
    /* Never reached: once its reply is hijacked, Fastify runs nothing after `onRequest`. */
    handler: () => undefined,
  };

  return Object.assign(route, {
    connections: wsHandler.connections,
    destroy: (stop?: { timeoutMs?: number | undefined }) => wsHandler.destroy(stop),
    stats: () => wsHandler.stats(),
    http,
  });
}

/** Did `@fastify/websocket` hand over a socket, rather than Fastify a request? */
function isSocket(value: unknown): value is WebSocketLike {
  if (typeof value !== "object" || value === null) return false;
  return (
    "send" in value &&
    typeof value.send === "function" &&
    "addEventListener" in value &&
    typeof value.addEventListener === "function"
  );
}

function pluginMissing(): ConfigurationError {
  return new ConfigurationError(
    "WEBSOCKET_PLUGIN_MISSING",
    [
      "[courier] courierWSHandler() was called as an ordinary HTTP route.",
      "",
      "Register @fastify/websocket before the route, so it opens the socket:",
      "  await fastify.register(fastifyWebsocket, { options: { maxPayload: wsFrameLimit() } })",
      '  fastify.get("/api/ws", { websocket: true }, courierWSHandler())',
    ].join("\n"),
  );
}

/** Tell the operator when the plugin reads frames far larger than any message it will take. */
function warnOnLargerPayloads(server: unknown, maxMessageSize: number): void {
  const maxPayload = pluginMaxPayload(server);
  const limit = wsFrameLimit(maxMessageSize);
  if (maxPayload === undefined || maxPayload <= limit) return;
  log.warn(
    `@fastify/websocket reads frames up to ${maxPayload} bytes, while Courier takes messages of at most ${maxMessageSize}. Register the plugin with { options: { maxPayload: wsFrameLimit(${maxMessageSize}) } } (${limit} bytes, from "@noverax/courier/node"): a message somewhat too large is then refused with 4413 and the socket kept, and a frame larger still is refused before it is read.`,
  );
}

/** The `maxPayload` the plugin's `ws` server was created with, where it can be read. */
function pluginMaxPayload(server: unknown): number | undefined {
  if (typeof server !== "object" || server === null || !("websocketServer" in server)) {
    return undefined;
  }
  const wss = server.websocketServer;
  if (typeof wss !== "object" || wss === null || !("options" in wss)) return undefined;
  const { options } = wss;
  if (typeof options !== "object" || options === null || !("maxPayload" in options)) {
    return undefined;
  }
  return typeof options.maxPayload === "number" ? options.maxPayload : undefined;
}
