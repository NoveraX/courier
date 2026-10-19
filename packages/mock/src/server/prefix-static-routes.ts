/**
 * Registration of SSE endpoints, which MUST be added before the catch-all
 * `/:id` route to prevent the param matcher from shadowing them.
 */

import type { Hono } from "hono";

import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { parsePathParams, parseQueryParams } from "./route-helpers";
import { routePath } from "./route-path";

/**
 * Register SSE endpoints as GET routes at the path each declares.
 *
 * A direct-mode client builds its URL from the endpoint's declared path —
 * `stream.get("stream")` is requested at `/{prefix}/stream`, and a path
 * parameter is filled in from the call's variables — so the mock serves it
 * there. The rest of the variables arrive as the query string; both are
 * forwarded to the stream function.
 *
 * Must be called before `/:id` to prevent the catch-all from matching first.
 *
 * @param app       The mock server's Hono app
 * @param prefix    Group prefix without its leading slash
 * @param endpoints The group's analyzed endpoints
 * @param group     Group name the handlers are registered under
 * @param config    Request entry point
 * @returns Nothing; the routes are added to `app`
 * @example
 * ```ts
 * registerSSERoutes(app, "live", endpoints, "live", config);
 * // GET /live/stream → live.ticker
 * ```
 */
export function registerSSERoutes(
  app: Hono,
  prefix: string,
  endpoints: MappedEndpoint[],
  group: string,
  config: PrefixRouteConfig,
): void {
  for (const ep of endpoints) {
    if (ep.transport !== "sse") continue;

    const { route, params } = routePath(`${prefix}/${ep.path || ep.name}`);
    app.get(route, (c) => {
      const query = parseQueryParams(new URL(c.req.url).searchParams);
      const variables = { ...query, ...parsePathParams(params(c.req.param())) };
      return config.handleRequest(c, group, ep.name, variables);
    });
  }
}
