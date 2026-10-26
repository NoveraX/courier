/**
 * Registration of SSE endpoints, which MUST be added before the catch-all
 * `/:id` route to prevent the param matcher from shadowing them.
 */

import type { Hono } from "hono";

import { carriesFixedQuery, withoutFixedQuery } from "./fixed-query";
import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { parsePathParams, parseQueryParams } from "./route-helpers";
import { byRouteOrder } from "./route-order";
import { routePath } from "./route-path";

/* A stream is routed at its path, or at its name when it declares none. */
const routedAt = (ep: MappedEndpoint): string => ep.path || ep.name;
const BY_ROUTE = byRouteOrder(routedAt);

/**
 * Register SSE endpoints as GET routes at the path each declares.
 *
 * A direct-mode client builds its URL from the endpoint's declared path —
 * `stream.get("stream")` is requested at `/{prefix}/stream`, and a path
 * parameter is filled in from the call's variables — so the mock serves it
 * there. The rest of the variables arrive as the query string; both are
 * forwarded to the stream function. A query the path writes is routed by
 * the path before it, as an HTTP endpoint's is: the stream answers only a
 * request that carries the query's values, which its variables leave out.
 * The routes are tried in the order an HTTP endpoint's are — `rooms/stats`
 * and `rooms/:id` before `rooms/{+name}` — whatever order declares them.
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
  for (const ep of endpoints.filter((e) => e.transport === "sse").sort(BY_ROUTE)) {
    const { route, params } = routePath(`${prefix}/${routedAt(ep)}`);
    app.get(route, (c, next) => {
      if (!carriesFixedQuery(c.req.url, ep.fixedQuery)) return next();
      const query = parseQueryParams(new URL(c.req.url).searchParams);
      const variables = {
        ...withoutFixedQuery(query, ep.fixedQuery),
        ...parsePathParams(params(c.req.param())),
      };
      return config.handleRequest(c, group, ep.name, variables);
    });
  }
}
