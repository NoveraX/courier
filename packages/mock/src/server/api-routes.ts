/**
 * The routes a Courier client in proxy mode, and a caller addressing an
 * endpoint by name, reach the mock server on:
 *
 * - `GET` and `POST /api/request` — the proxy's HTTP route
 * - `GET /api/sse` — the proxy's stream route
 * - `/api/:group/:method` — REST-style addressing by name
 *
 * The proxy's WebSocket route, `/api/ws`, is served on the upgrade, in
 * `channel-sockets`, as each channel's own path is.
 */

import { proxyRefusal } from "@noverax/courier/internal";
import type { Hono, Context as HonoContext } from "hono";

import type { PrefixMapping } from "./prefix-route-types";
import { registerPrefixRoutes } from "./prefix-routes";
import { proxyFailure } from "./proxy-failure";
import { readProxyCall } from "./read-proxy-call";
import { bodyValue } from "./read-request-body";
import { refusalOf } from "./refusal-of";
import { refuseRequest } from "./refuse-request";
import { readRouteBody } from "./route-body";
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
      refuse: (c, group, method, refusal) => refuseRequest(c, group, method, refusal, config),
      readBody: (c, group, method) => readRouteBody(c, config, group, method),
    });
  }
  registerRestRoutes(app, config);
}

/**
 * Register the proxy's HTTP route, `/api/request`: a POST for a call that
 * writes, and the cacheable GET a proxy client sends for one that reads.
 * A mock that knows the API it stands in for refuses what that API's own
 * proxy would, with the proxy's status, so a page that works against the
 * mock is not refused by the proxy.
 */
export function registerProxyRoute(app: Hono, config: RouteConfig): void {
  app.on(["GET", "POST"], "/api/request", async (c: HonoContext) => {
    const call = await readProxyCall(c, (group, method) => readRouteBody(c, config, group, method));
    if ("error" in call) {
      return call.method === undefined
        ? c.json(proxyFailure(call.error), call.status)
        : refuseRequest(c, call.group ?? "", call.method, call, config, "proxy");
    }
    const via = c.req.method === "GET" ? "GET" : "POST";
    const refused = config.source && proxyRefusal(config.source, { ...call, via });
    if (refused)
      return refuseRequest(c, call.group, call.method, refusalOf(refused), config, "proxy");
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
 * refused with 400, as is a stream the API keeps from a browser. Only an
 * endpoint mocked as a stream is served here.
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
    if (!method) return c.json(proxyFailure("The stream to open is not named (_m)"), 400);
    const variables = wireVariables(params.get("_v"));
    if (variables === INVALID)
      return c.json(proxyFailure("Variables (_v) must be a JSON object"), 400);
    const group = params.get("_g") ?? "";
    const call = { source: params.get("_s") ?? "", group, method, via: "sse" } as const;
    const refused = config.source && proxyRefusal(config.source, call);
    if (refused) return refuseRequest(c, group, method, refusalOf(refused), config, "proxy");
    return handleMockRequest(c, group, method, variables, config, { stream: true });
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
    const body = await readRouteBody(c, config, group, method);
    if ("error" in body) return refuseRequest(c, group, method, body, config);
    return handleMockRequest(c, group, method, bodyValue(body), config);
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
