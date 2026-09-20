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

export type CourierPluginOptions = {
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

  fastify.all(opts.prefix ? `${opts.prefix}/*` : "/*", async (request, reply) => {
    tryDiscoverAppOrigin(request);
    const webReq = toWebRequest(request.raw);
    const webRes = await handle(webReq);
    await sendWebResponse(webRes, reply.raw);
    reply.hijack();
  });
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
    const webReq = toWebRequest(request.raw);
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
