import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { sendWebResponse, toWebRequest } from "@noverax/nexus/node";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";

export type NexusPluginOptions = {
  sources: Sources;
  prefix?: string;
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
  const { handle } = createHandler(opts.sources);

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
