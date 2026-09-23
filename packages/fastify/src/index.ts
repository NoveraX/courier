import type { CourierWSOptions, HandlerConfig, WebSocketLike } from "@noverax/courier";
import {
  createHandler,
  createWSHandler,
  getAppOrigin,
  requireSources,
  setAppOrigin,
} from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";

import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "@noverax/courier/node";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 * Fastify adapters stamp `appOrigin` from the first request's `Host`
 * header when no config/env value is present. Config-supplied or
 * env-var values take precedence and are never overwritten.
 */
let firstRequestHandled = false;

function tryDiscoverAppOrigin(request: FastifyRequest): void {
  if (firstRequestHandled) return;
  firstRequestHandled = true;
  if (getAppOrigin()) return;
  const origin = extractOriginFromNodeRequest(request.raw);
  if (origin) setAppOrigin(origin);
}

/** Where the proxy caller sends its calls unless told otherwise. */
const DEFAULT_PROXY_PATH = "/api/request";

export type CourierPluginOptions = {
  /**
   * The path the proxy answers at — the caller's `proxyPath.http`. Without
   * one it answers at `/api/request`, where the caller looks by default.
   *
   * Fastify is what applies it: every route a plugin registers is already
   * scoped by the `prefix` passed to `register`. The plugin must not apply it
   * a second time — doing so put the proxy at `/api/request/api/request/*`.
   */
  prefix?: string;
  config?: HandlerConfig;
};

/**
 * Fastify plugin for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before registering the plugin.
 *
 * @example
 * ```ts
 * import Fastify from "fastify";
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * import { courierPlugin } from "@noverax/courier-fastify";
 *
 * const app = Fastify();
 * await attachRuntime();
 * app.register(courierPlugin, { prefix: "/api/request" });
 * ```
 */
export const courierPlugin: FastifyPluginAsync<CourierPluginOptions> = async (
  fastify: FastifyInstance,
  opts: CourierPluginOptions,
) => {
  const { handle } = createHandler(opts.config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "fastify",
  });

  // Prevent Fastify from consuming the request body
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser("*", (_request, _payload, done) => {
    done(null);
  });

  const proxy = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    tryDiscoverAppOrigin(request);
    const webReq = toWebRequest(request.raw, reply.raw);
    const webRes = await handle(webReq);
    await sendWebResponse(webRes, reply.raw);
    reply.hijack();
  };

  /* The proxy caller calls exactly one path, so that path is all the plugin
     takes. It used to take `/` and `/*` as well — with no prefix, the default
     the README showed, that was every path the app did not route itself, and
     its 404s answered 400 with a Courier error body. Without a prefix it now
     sits where the caller looks by default. */
  fastify.all(opts.prefix ? "/" : DEFAULT_PROXY_PATH, proxy);
};

/**
 * Create a Fastify route handler for SSE streaming endpoints.
 *
 * @example
 * ```ts
 * fastify.get("/api/sse", courierSSEHandler());
 * ```
 */
export function courierSSEHandler(
  config?: HandlerConfig,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const { handleSSE } = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "fastify",
  });

  return async (request: FastifyRequest, reply: FastifyReply) => {
    tryDiscoverAppOrigin(request);
    reply.hijack();
    const webReq = toWebRequest(request.raw, reply.raw);
    const webRes = await handleSSE(webReq);
    await sendWebResponse(webRes, reply.raw);
  };
}

/**
 * Create a Fastify WebSocket route handler for Courier realtime.
 * Requires `@fastify/websocket` plugin to be registered.
 *
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Route handler for `{ websocket: true }` routes
 *
 * @example
 * ```ts
 * import fastifyWebsocket from "@fastify/websocket";
 * import { courierWSHandler } from "@noverax/courier-fastify";
 *
 * await fastify.register(fastifyWebsocket);
 * fastify.get("/ws", { websocket: true }, courierWSHandler());
 * ```
 */
export function courierWSHandler(
  options?: CourierWSOptions,
): (socket: WebSocketLike, request: FastifyRequest) => void {
  const wsHandler = createWSHandler(options);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "fastify",
  });

  return (socket: WebSocketLike, request: FastifyRequest) => {
    tryDiscoverAppOrigin(request);
    const webReq = toWebRequest(request.raw);
    wsHandler.handleSocket(socket, webReq);
  };
}
