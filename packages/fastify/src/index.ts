import type { AdapterHandler, HandlerConfig } from "@noverax/courier";
import { createHandler, requireSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { discoverNodeAppOrigin, sendWebResponse, toWebRequest } from "@noverax/courier/node";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

export { courierWSHandler } from "./ws-handler";

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
 * The route also serves SSE streams, and `app.close()` drains them: each
 * client gets a `shutdown` event telling it when to reconnect, instead of
 * the close waiting out the streams' lifetime cap.
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
  const { handle, shutdownSSE } = createHandler(opts.config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "fastify",
  });
  fastify.addHook("preClose", () => shutdownSSE());

  // Prevent Fastify from consuming the request body
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser("*", (_request, _payload, done) => {
    done(null);
  });

  const proxy = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    discoverNodeAppOrigin(request.raw);
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
 * A Fastify route handler for SSE streams that can drain the streams it
 * serves — `app.close()` otherwise waits on them until their lifetime cap.
 */
export type CourierSSERouteHandler = ((
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>) &
  Pick<AdapterHandler, "sseConnections" | "shutdownSSE">;

/**
 * Create a Fastify route handler for SSE streaming endpoints.
 *
 * @param config - Handler options, such as `allowedOrigins` or stream lifetimes
 * @returns The route handler, with `shutdownSSE()` to call from `preClose`
 *
 * @example
 * ```ts
 * const sse = courierSSEHandler();
 * fastify.get("/api/sse", sse);
 * fastify.addHook("preClose", () => sse.shutdownSSE());
 * ```
 */
export function courierSSEHandler(config?: HandlerConfig): CourierSSERouteHandler {
  const { handleSSE, sseConnections, shutdownSSE } = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "fastify",
  });

  const route = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    discoverNodeAppOrigin(request.raw);
    reply.hijack();
    const webReq = toWebRequest(request.raw, reply.raw);
    const webRes = await handleSSE(webReq);
    await sendWebResponse(webRes, reply.raw);
  };
  return Object.assign(route, { sseConnections, shutdownSSE });
}
