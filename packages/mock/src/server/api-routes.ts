/**
 * The routes a Courier client in proxy mode, and a caller addressing an
 * endpoint by name, reach the mock server on:
 *
 * - `GET` and `POST /api/request` — the proxy's HTTP route
 * - `GET /api/sse` — the proxy's stream route
 * - `/api/:group/:method` — REST-style addressing by name
 */

import type { Hono, Context as HonoContext } from "hono";

import type { PrefixMapping } from "./prefix-routes";
import { registerPrefixRoutes } from "./prefix-routes";
import { readJsonBody } from "./read-json-body";
import { readProxyCall } from "./read-proxy-call";
import { handleMockRequest } from "./route-generator";
import { parseQueryParams } from "./route-helpers";
import type { RouteConfig } from "./route-types";

/**
 * Register every route that answers a mocked endpoint: the proxy's HTTP and
 * stream routes, REST-style addressing by name, and — for a server built
 * from a source — each group's routes at the paths it declares.
 *
 * @param app      The mock server's Hono app
 * @param config   The route config every request is handled with
 * @param mappings The groups' prefixes and endpoints, for a server built from a source
 * @returns Nothing; the routes are added to `app`
 * @example
 * ```ts
 * registerRequestRoutes(app, routeConfig, buildPrefixMappings(api, analyzeRoutes(api)));
 * ```
 */
export function registerRequestRoutes(
  app: Hono,
  config: RouteConfig,
  mappings: PrefixMapping[] | undefined,
): void {
  registerProxyRoute(app, config);
  registerProxySSERoute(app, config);
  /* The paths the source declares come before addressing by name: a source
     at `…/api` is called at `/api/users/5`, which `/api/:group/:method` would
     otherwise take for an endpoint named "5". */
  if (mappings?.length) {
    registerPrefixRoutes(app, mappings, {
      handleRequest: (c, group, method, variables) =>
        handleMockRequest(c, group, method, variables, config),
    });
  }
  registerRestRoutes(app, config);
}

/**
 * Register the proxy's HTTP route, `/api/request`: a POST for a call that
 * writes, and the cacheable GET a proxy client sends for one that reads.
 */
export function registerProxyRoute(app: Hono, config: RouteConfig): void {
  app.on(["GET", "POST"], "/api/request", async (c: HonoContext) => {
    const call = await readProxyCall(c);
    if ("error" in call) return c.json({ error: call.error }, 400);
    // A `.raw` call is answered with the response around the data, as a Courier proxy does
    return handleMockRequest(c, call.group, call.method, call.variables, config, {
      raw: call.raw,
    });
  });
}

/**
 * Register the proxy's stream route, `GET /api/sse?_s=…&_g=…&_m=…&_v=…`,
 * where a proxy client opens every subscription. The variables arrive as
 * one JSON object in `_v`, as a Courier proxy reads them; anything else is
 * refused with 400. Only an endpoint mocked as a stream is served here.
 *
 * @param app    The mock server's Hono app
 * @param config The route config every request is handled with
 * @returns Nothing; the route is added to `app`
 * @example
 * ```ts
 * registerProxySSERoute(app, config);
 * // GET /api/sse?_s=api&_g=live&_m=ticker&_v={"room":"lobby"}
 * ```
 */
export function registerProxySSERoute(app: Hono, config: RouteConfig): void {
  app.get("/api/sse", (c: HonoContext) => {
    const params = new URL(c.req.url).searchParams;
    const method = params.get("_m");
    if (!method) return c.json({ error: "The stream to open is not named (_m)" }, 400);
    const variables = wireVariables(params.get("_v"));
    if (variables === INVALID)
      return c.json({ error: "Variables (_v) must be a JSON object" }, 400);
    return handleMockRequest(c, params.get("_g") ?? "", method, variables, config, {
      stream: true,
    });
  });
}

/** Register REST-style routes: POST /api/:group/:method */
export function registerRestRoutes(app: Hono, config: RouteConfig): void {
  app.all("/api/:group/:method", async (c: HonoContext) => {
    const group = c.req.param("group") ?? "";
    const method = c.req.param("method") ?? "";
    if (c.req.method === "GET") {
      /* Typed as the mapped routes type theirs: `42` a number, `007` a string. */
      const query = parseQueryParams(new URL(c.req.url).searchParams);
      return handleMockRequest(c, group, method, query, config);
    }
    const body = await readJsonBody(c);
    if ("error" in body) return c.json({ error: body.error }, 400);
    return handleMockRequest(c, group, method, body.value, config);
  });
}

const INVALID = Symbol("invalid variables");

function wireVariables(raw: string | null): Record<string, unknown> | undefined | typeof INVALID {
  if (!raw) return undefined;
  const decoded = parseJson(raw);
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return INVALID;
  return { ...decoded };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return INVALID;
  }
}
