import { sendsVariablesInQuery } from "@noverax/courier/internal";
import type { Context, Hono } from "hono";

import { carriesFixedQuery, withoutFixedQuery } from "./fixed-query";
import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { RAW_BESIDE_PATH_VALUES } from "./raw-body-refusal";
import { type BodyRefusal, bodyValue, type RequestBody } from "./read-request-body";
import { parsePathParams, parseQueryParams, servedByCatchAll } from "./route-helpers";
import { byRouteOrder } from "./route-order";
import { routePath } from "./route-path";

const METHODS = new Set<string>([
  "GET",
  "HEAD",
  "OPTIONS",
  "QUERY",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/* An HTTP endpoint is routed at its path, an empty one at its group's prefix. */
const BY_ROUTE = byRouteOrder((ep) => ep.path);

/**
 * Register a route at its declared path for every HTTP endpoint the prefix
 * catch-alls do not answer: fixed sub-paths (`stats`), lookups
 * (`by-email/:email`), paths that go on past a parameter (`:id/orders`), and
 * methods the catch-alls leave out (`PUT` on the collection, `POST :id`,
 * every `QUERY`, `HEAD` and `OPTIONS`). The path's parameters join the query
 * or body as variables.
 *
 * Routes are registered most specific first — a fixed segment before a
 * parameter at the same position, and a path that goes on past a `{+name}`
 * before the one that ends with it — and all of them before the catch-alls,
 * so `/users/stats` never reaches `/users/:id`.
 *
 * @param app       The mock server's Hono app
 * @param prefix    Group prefix without its leading slash
 * @param endpoints The group's analyzed endpoints
 * @param group     Group name the handlers are registered under
 * @param config    Request entry point
 * @param options   `every` gives every HTTP endpoint a route of its own, for a
 *   group that declares no prefix and so has no catch-alls
 * @returns Nothing; the routes are added to `app`
 * @example
 * ```ts
 * registerDeclaredRoutes(app, "users", endpoints, "users", config);
 * // GET /users/:id/orders → users.orders with { id }
 * ```
 */
export function registerDeclaredRoutes(
  app: Hono,
  prefix: string,
  endpoints: MappedEndpoint[],
  group: string,
  config: PrefixRouteConfig,
  { every = false }: { every?: boolean } = {},
): void {
  const own = endpoints
    .filter((ep) => (every ? isServedHttp(ep) : needsOwnRoute(ep)))
    .sort((a, b) => BY_ROUTE(a, b) || headFirst(a, b));
  for (const ep of own) {
    const method = (ep.httpMethod ?? "GET").toUpperCase();
    /* A route at the collection root is `/users`, not `/users/`, which a
       request to the collection never matches. */
    const { route, params } = routePath(`${prefix}/${ep.path}`);
    /* Hono answers every HEAD with the GET route at its path, so a HEAD
       endpoint is a GET route that hands any other request on. */
    app.on(method === "HEAD" ? "GET" : method, route, async (c, next) => {
      if (method === "HEAD" && c.req.method !== "HEAD") return next();
      /* A path that fixes query values answers only a request that carries them. */
      if (!carriesFixedQuery(c.req.url, ep.fixedQuery)) return next();
      const read = await inputOf(c, method, () => config.readBody(c, group, ep.name));
      if ("error" in read) return config.refuse(c, group, ep.name, read);
      const variables = variablesOf(read, ep, parsePathParams(params(c.req.param())));
      if ("error" in variables) return config.refuse(c, group, ep.name, variables);
      return config.handleRequest(c, group, ep.name, variables.value);
    });
  }
}

/* The input with the path's values laid over it; a file sent as the whole body has no fields to hold them. */
function variablesOf(
  read: { input: Record<string, unknown> } | { blob: Blob },
  ep: MappedEndpoint,
  pathValues: Record<string, unknown>,
): { value: unknown } | BodyRefusal {
  if ("input" in read) {
    return { value: { ...withoutFixedQuery(read.input, ep.fixedQuery), ...pathValues } };
  }
  return Object.keys(pathValues).length > 0 ? RAW_BESIDE_PATH_VALUES : { value: read.blob };
}

function needsOwnRoute(ep: MappedEndpoint): boolean {
  return isServedHttp(ep) && !servedByCatchAll(ep);
}

/* An HTTP endpoint with a verb the mock serves. */
function isServedHttp(ep: MappedEndpoint): boolean {
  if (ep.transport === "sse" || ep.transport === "ws") return false;
  return METHODS.has((ep.httpMethod ?? "GET").toUpperCase());
}

/* A HEAD endpoint's route comes before the GET at its path, which answers HEAD otherwise. */
function headFirst(a: MappedEndpoint, b: MappedEndpoint): number {
  const isHead = (ep: MappedEndpoint) => (ep.httpMethod ?? "").toUpperCase() === "HEAD";
  return Number(isHead(b)) - Number(isHead(a));
}

/**
 * The query of a GET, HEAD, OPTIONS or DELETE; the JSON or form of anything
 * else — a QUERY's question included — which holds an object; or a file sent
 * as the whole body, as its `Blob`.
 */
async function inputOf(
  c: Context,
  method: string,
  readBody: () => Promise<RequestBody>,
): Promise<{ input: Record<string, unknown> } | { blob: Blob } | BodyRefusal> {
  if (sendsVariablesInQuery(method)) {
    return { input: parseQueryParams(new URL(c.req.url).searchParams) };
  }
  const body = await readBody();
  if ("error" in body) return body;
  if (body.kind === "raw") return { blob: body.blob };
  const value = bodyValue(body);
  if (value === undefined) return { input: {} };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { input: { ...value } };
  }
  return { error: "The request body is not a JSON object", status: 400 };
}
