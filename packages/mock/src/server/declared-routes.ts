import { sendsVariablesInQuery } from "@noverax/courier/internal";
import type { Context, Hono } from "hono";

import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { type BodyLimits, bodyValue, readRequestBody } from "./read-request-body";
import { parsePathParams, parseQueryParams, servedByCatchAll } from "./route-helpers";

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

/**
 * Register a route at its declared path for every HTTP endpoint the prefix
 * catch-alls do not answer: fixed sub-paths (`stats`), lookups
 * (`by-email/:email`), paths that go on past a parameter (`:id/orders`), and
 * methods the catch-alls leave out (`PUT` on the collection, `POST :id`,
 * every `QUERY`, `HEAD` and `OPTIONS`). The path's parameters join the query
 * or body as variables.
 *
 * Routes are registered most specific first — a fixed segment before a
 * parameter at the same position — and all of them before the catch-alls,
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
    .sort((a, b) => bySpecificity(a, b) || headFirst(a, b));
  for (const ep of own) {
    const method = (ep.httpMethod ?? "GET").toUpperCase();
    /* A route at the collection root is `/users`, not `/users/`, which a
       request to the collection never matches. */
    const path = `/${[prefix, ...ep.path.split("/")].filter(Boolean).join("/")}`;
    /* Hono answers every HEAD with the GET route at its path, so a HEAD
       endpoint is a GET route that hands any other request on. */
    app.on(method === "HEAD" ? "GET" : method, path, async (c, next) => {
      if (method === "HEAD" && c.req.method !== "HEAD") return next();
      /* A path that fixes query values answers only a request that carries them. */
      if (!carriesFixedQuery(c.req.url, ep.fixedQuery)) return next();
      const read = await inputOf(c, method, config.bodyLimits);
      if ("error" in read) return config.refuse(c, group, ep.name, read);
      return config.handleRequest(c, group, ep.name, {
        ...withoutFixedQuery(read.input, ep.fixedQuery),
        ...parsePathParams(c.req.param()),
      });
    });
  }
}

function needsOwnRoute(ep: MappedEndpoint): boolean {
  return isServedHttp(ep) && !servedByCatchAll(ep);
}

function carriesFixedQuery(url: string, fixed: MappedEndpoint["fixedQuery"]): boolean {
  if (fixed === undefined) return true;
  const query = new URL(url).searchParams;
  return Object.entries(fixed).every(([name, value]) => query.getAll(name).includes(value));
}

/* The variables without the values the path fixes, which no variable declares. */
function withoutFixedQuery(
  input: Record<string, unknown>,
  fixed: MappedEndpoint["fixedQuery"],
): Record<string, unknown> {
  if (fixed === undefined) return input;
  return Object.fromEntries(Object.entries(input).filter(([name]) => !Object.hasOwn(fixed, name)));
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

/** Fixed segments sort before parameters, position by position */
function bySpecificity(a: MappedEndpoint, b: MappedEndpoint): number {
  const rank = (ep: MappedEndpoint) =>
    ep.path
      .split("/")
      .filter(Boolean)
      .map((segment) => (segment.startsWith(":") ? "1" : "0"))
      .join("");
  /* At one path, the endpoint whose query is fixed comes first: the other takes what is left. */
  const fixes = (ep: MappedEndpoint) => Object.keys(ep.fixedQuery ?? {}).length;
  return rank(a).localeCompare(rank(b)) || fixes(b) - fixes(a);
}

/** The query of a GET, HEAD, OPTIONS or DELETE; the JSON, form or upload of anything else — a QUERY's question included — which holds an object */
async function inputOf(
  c: Context,
  method: string,
  limits: BodyLimits | undefined,
): Promise<{ input: Record<string, unknown> } | { error: string; status: 400 | 413 }> {
  if (sendsVariablesInQuery(method)) {
    return { input: parseQueryParams(new URL(c.req.url).searchParams) };
  }
  const body = await readRequestBody(c, limits);
  if ("error" in body) return body;
  const value = bodyValue(body);
  if (value === undefined) return { input: {} };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { input: { ...value } };
  }
  return { error: "The request body is not a JSON object", status: 400 };
}
