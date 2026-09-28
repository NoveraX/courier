/**
 * Registration of SSE endpoints, which MUST be added before the catch-all
 * `/:id` route to prevent the param matcher from shadowing them.
 *
 * `registerSSERoutes` exposes direct-mode SSE endpoints at `/{prefix}/{name}`
 * so REST-style SSE clients (built by `buildDirectSSEUrl`) hit the same path.
 */

import type { Hono } from "hono";

import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { parseQueryParams } from "./route-helpers";

/**
 * Register SSE endpoints as explicit GET routes at `/{prefix}/{name}`.
 *
 * Direct-mode SSE clients use REST-style URLs (built by `buildDirectSSEUrl`),
 * so the mock server must serve them at the same path. Variables are passed
 * as query string params and forwarded to the streamFn via handleMockRequest.
 *
 * Must be called before `/:id` to prevent the catch-all from matching first.
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

    const routePath = `/${prefix}/${ep.name}`;
    app.get(routePath, (c) => {
      const variables = parseQueryParams(new URL(c.req.url).searchParams);
      return config.handleRequest(c, group, ep.name, variables);
    });
  }
}
