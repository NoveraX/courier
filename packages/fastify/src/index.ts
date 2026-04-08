import type { HandlerConfig, NexusWSOptions, WebSocketLike } from "@noverax/nexus";
import { createHandler, createWSHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";

import { sendWebResponse, toWebRequest } from "@noverax/nexus/node";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

export type NexusPluginOptions = {
  sources: Sources;
  prefix?: string;
  config?: HandlerConfig;
};

/**
 * Fastify plugin for the nexus proxy.
 *
 * @example
 * ```ts
 * import Fastify from "fastify";
 * import { nexusPlugin } from "@noverax/nexus-fastify";
 *
 * const app = Fastify();
 * app.register(nexusPlugin, { sources, prefix: "/api/request" });
 * ```
 */
export const nexusPlugin: FastifyPluginAsync<NexusPluginOptions> = async (
  fastify: FastifyInstance,
  opts: NexusPluginOptions,
) => {
  const { handle } = createHandler(opts.sources, opts.config);

  // Prevent Fastify from consuming the request body
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser("*", (_request, _payload, done) => {
    done(null);
  });

  fastify.all(opts.prefix ? `${opts.prefix}/*` : "/*", async (request, reply) => {
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
 * fastify.get("/api/sse", nexusSSEHandler(sources));
 * ```
 */
export function nexusSSEHandler(sources: Sources, config?: HandlerConfig) {
  const { handleSSE } = createHandler(sources, config);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack();
    const webReq = toWebRequest(request.raw);
    const webRes = await handleSSE(webReq);
    await sendWebResponse(webRes, reply.raw);
  };
}

/**
 * Create a Fastify WebSocket route handler for Nexus realtime.
 * Requires `@fastify/websocket` plugin to be registered.
 *
 * @param sources - Registered API sources
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Route handler for `{ websocket: true }` routes
 *
 * @example
 * ```ts
 * import fastifyWebsocket from "@fastify/websocket";
 * import { nexusWSHandler } from "@noverax/nexus-fastify";
 *
 * await fastify.register(fastifyWebsocket);
 * fastify.get("/ws", { websocket: true }, nexusWSHandler(sources));
 * ```
 */
export function nexusWSHandler(
  sources: Sources,
  options?: NexusWSOptions,
): (socket: WebSocketLike, request: FastifyRequest) => void {
  const wsHandler = createWSHandler({ sources, ...options });

  return (socket: WebSocketLike, request: FastifyRequest) => {
    const webReq = toWebRequest(request.raw);
    wsHandler.handleSocket(socket, webReq);
  };
}
