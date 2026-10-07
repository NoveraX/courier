import { nodeIncomingRequest, withIncomingRequest } from "@noverax/courier/node";
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

/**
 * A Fastify `onRequest` hook that serves the rest of each request with its
 * session and headers at hand: every call a route, a service or a
 * background step it awaits makes takes them from the request — for the
 * APIs that keep a `session` or `forward` headers — and the session cookies
 * the API sets reach the browser on the reply, beside any the route sets.
 *
 * Add it on the root instance: a hook added there runs for every route,
 * whichever plugin registers it. The user's address is taken from the
 * socket, after the chain a proxy on a private network recorded — the rule
 * the proxy route follows — whatever `trustProxy` says.
 *
 * @returns The hook
 * @example
 * ```ts
 * import Fastify from "fastify";
 * import { requestContext } from "@noverax/courier-fastify";
 *
 * const app = Fastify();
 * app.addHook("onRequest", requestContext());
 * app.get("/account", async () => api.users.me());
 * ```
 */
export function requestContext(): (
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) => void {
  return (request, reply, done) => {
    const incoming = {
      ...nodeIncomingRequest(request.raw),
      setCookie: ({ header }: { header: string }) => sendCookie(reply, header),
    };
    withIncomingRequest(incoming, done);
  };
}

/* Fastify keeps every `set-cookie` a reply is given, where another header is replaced. */
function sendCookie(reply: FastifyReply, header: string): true | string {
  if (reply.sent) return "the reply had already been sent";
  reply.header("set-cookie", header);
  return true;
}
