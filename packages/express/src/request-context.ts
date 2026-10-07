import type { IncomingMessage, ServerResponse } from "node:http";
import { requestContext as nodeRequestContext } from "@noverax/courier/node";

/**
 * Express middleware that serves the rest of each request with its session
 * and headers at hand: every call a route, a service or a background step
 * it awaits makes takes them from the request — for the APIs that keep a
 * `session` or `forward` headers — and the session cookies the API sets
 * reach the browser on the response.
 *
 * Mount it before the routes that call APIs. The user's address is taken
 * from the socket, after the chain a proxy on a private network recorded —
 * the rule the proxy route follows — whatever `trust proxy` says.
 *
 * @returns The middleware
 * @example
 * ```ts
 * import express from "express";
 * import { requestContext } from "@noverax/courier-express";
 *
 * const app = express();
 * app.use(requestContext());
 * app.get("/account", async (_req, res) => res.json(await api.users.me()));
 * ```
 */
export function requestContext(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  return nodeRequestContext();
}
