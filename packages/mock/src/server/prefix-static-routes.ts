/**
 * Registration helpers for SSE endpoints and static sub-path endpoints.
 *
 * Extracted from `prefix-routes.ts` so the main file can focus on the CRUD
 * (`GET` / `POST` / `PUT` / `PATCH` / `DELETE`) routes. Both helpers in this
 * module register routes that MUST be added before the catch-all `/:id` route
 * to prevent the param matcher from shadowing them.
 *
 * - `registerSSERoutes` exposes direct-mode SSE endpoints at `/{prefix}/{name}`
 *   so REST-style SSE clients (built by `buildDirectSSEUrl`) hit the same path.
 * - `registerStaticSubPaths` registers explicit routes for endpoints whose
 *   path is a fixed segment (e.g. `"browse"`, `"categories"`). WS and SSE
 *   endpoints are skipped because they have their own registration paths.
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

/**
 * Register explicit routes for endpoints that have a fixed sub-path (not a param).
 * E.g. `GET /adoptions/browse` for an endpoint with path="browse".
 *
 * Must be called before registering `/:id` to prevent the catch-all from matching first.
 */
export function registerStaticSubPaths(
  app: Hono,
  prefix: string,
  endpoints: MappedEndpoint[],
  group: string,
  config: PrefixRouteConfig,
): void {
  for (const ep of endpoints) {
    // Skip SSE/WS — they have their own registration paths
    if (ep.transport === "sse" || ep.transport === "ws") continue;
    if (!ep.path || ep.path.startsWith(":")) continue;

    const httpMethod = (ep.httpMethod ?? "GET").toUpperCase();
    const routePath = `/${prefix}/${ep.path}`;

    if (httpMethod === "GET") {
      app.get(routePath, (c) => {
        const variables = parseQueryParams(new URL(c.req.url).searchParams);
        return config.handleRequest(c, group, ep.name, variables);
      });
    } else if (httpMethod === "POST") {
      app.post(routePath, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return config.handleRequest(c, group, ep.name, body);
      });
    } else if (httpMethod === "PUT") {
      app.put(routePath, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return config.handleRequest(c, group, ep.name, body);
      });
    } else if (httpMethod === "PATCH") {
      app.patch(routePath, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return config.handleRequest(c, group, ep.name, body);
      });
    } else if (httpMethod === "DELETE") {
      app.delete(routePath, (c) => config.handleRequest(c, group, ep.name, {}));
    }
  }
}
