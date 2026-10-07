import type { IncomingMessage, ServerResponse } from "node:http";
import { requestContext as nodeRequestContext } from "@noverax/courier/node";

/**
 * Middleware that serves the rest of each request with the user's session
 * and headers at hand: every call a guard, an interceptor, a pipe, a
 * controller, a service or a step it awaits makes takes them from the
 * request — for the APIs that keep a `session` or `forward` headers — and
 * the session cookies the API sets reach the browser on the response,
 * beside any the application sets.
 *
 * Mount it with `app.use()` as the application is created, before it
 * listens: on Nest's Express platform and on its Fastify platform alike,
 * it then runs before every module's own middleware. The user's address
 * is taken from the socket, after the chain a proxy on a private network
 * recorded — the rule the proxy route follows.
 *
 * @returns The middleware
 * @example
 * ```ts
 * import { NestFactory } from "@nestjs/core";
 * import { requestContext } from "@noverax/courier-nestjs";
 *
 * const app = await NestFactory.create(AppModule);
 * app.use(requestContext());
 * await app.listen(3000);
 * ```
 */
export function requestContext(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  return nodeRequestContext();
}
