import type { CourierWSOptions, WebSocketLike } from "@noverax/courier";
import {
  ConfigurationError,
  createLogger,
  createWSHandler,
  requireSources,
} from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import {
  DEFAULT_WS_MAX_MESSAGE_SIZE,
  discoverNodeAppOrigin,
  toWebRequest,
} from "@noverax/courier/node";
import type { FastifyRequest } from "fastify";

const log = createLogger("Fastify");

/**
 * Create a Fastify WebSocket route handler for Courier realtime.
 *
 * It runs on `@fastify/websocket`, which must be registered first; called
 * without it, the route answers 500 with an error that says so.
 *
 * The plugin's `ws` server reads each frame whole before the handler sees
 * it, up to its own `maxPayload` — 100 MiB unless the plugin is registered
 * with another. Register it with `options: { maxPayload }` no larger than
 * `maxMessageSize`, so a larger frame is refused before it is read, as the
 * Express and Nest adapters refuse one; the handler warns once when the
 * plugin would read more.
 *
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Route handler for `{ websocket: true }` routes
 *
 * @example
 * ```ts
 * import fastifyWebsocket from "@fastify/websocket";
 * import { courierWSHandler } from "@noverax/courier-fastify";
 *
 * await fastify.register(fastifyWebsocket, { options: { maxPayload: 65_536 } });
 * fastify.get("/api/ws", { websocket: true }, courierWSHandler());
 * ```
 */
export function courierWSHandler(
  options?: CourierWSOptions,
): (socket: WebSocketLike, request: FastifyRequest) => void {
  const wsHandler = createWSHandler(options);
  const maxMessageSize = options?.maxMessageSize ?? DEFAULT_WS_MAX_MESSAGE_SIZE;
  let checkedPayloadLimit = false;
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "fastify",
  });

  return (socket: unknown, request: FastifyRequest) => {
    if (!isSocket(socket)) throw pluginMissing();
    if (!checkedPayloadLimit) {
      checkedPayloadLimit = true;
      warnOnLargerPayloads(request.server, maxMessageSize);
    }
    discoverNodeAppOrigin(request.raw);
    wsHandler.handleSocket(socket, toWebRequest(request.raw));
  };
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
      "  await fastify.register(fastifyWebsocket, { options: { maxPayload: 65_536 } })",
      '  fastify.get("/api/ws", { websocket: true }, courierWSHandler())',
    ].join("\n"),
  );
}

/** Tell the operator when the plugin reads frames the handler will refuse. */
function warnOnLargerPayloads(server: unknown, maxMessageSize: number): void {
  const maxPayload = pluginMaxPayload(server);
  if (maxPayload === undefined || maxPayload <= maxMessageSize) return;
  log.warn(
    `@fastify/websocket reads frames up to ${maxPayload} bytes before Courier refuses those over its maxMessageSize of ${maxMessageSize}. Register the plugin with { options: { maxPayload: ${maxMessageSize} } } so a larger frame is refused before it is read.`,
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
