import type { Context, Hono } from "hono";

import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { type BodyLimits, bodyValue, readRequestBody } from "./read-request-body";
import { parsePathParams, parseQueryParams, servedByCatchAll } from "./route-helpers";

const METHODS = new Set<string>(["GET", "QUERY", "POST", "PUT", "PATCH", "DELETE"]);
const WITHOUT_BODY = new Set<string>(["GET", "DELETE"]);

/**
 * Register a route at its declared path for every HTTP endpoint the prefix
 * catch-alls do not answer: fixed sub-paths (`stats`), lookups
 * (`by-email/:email`), paths that go on past a parameter (`:id/orders`), and
 * methods the catch-alls leave out (`PUT` on the collection, `POST :id`,
 * every `QUERY`). The path's parameters join the query or body as variables.
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
): void {
  const own = endpoints.filter(needsOwnRoute).sort(bySpecificity);
  for (const ep of own) {
    const method = (ep.httpMethod ?? "GET").toUpperCase();
    /* A route at the collection root is `/users`, not `/users/`, which a
       request to the collection never matches. */
    const path = `/${[prefix, ...ep.path.split("/")].filter(Boolean).join("/")}`;
    app.on(method, path, async (c) => {
      const read = await inputOf(c, method, config.bodyLimits);
      if ("error" in read) return config.refuse(c, group, ep.name, read);
      return config.handleRequest(c, group, ep.name, {
        ...read.input,
        ...parsePathParams(c.req.param()),
      });
    });
  }
}

function needsOwnRoute(ep: MappedEndpoint): boolean {
  if (ep.transport === "sse" || ep.transport === "ws") return false;
  const method = (ep.httpMethod ?? "GET").toUpperCase();
  if (!METHODS.has(method)) return false;
  return !servedByCatchAll(ep);
}

/** Fixed segments sort before parameters, position by position */
function bySpecificity(a: MappedEndpoint, b: MappedEndpoint): number {
  const rank = (ep: MappedEndpoint) =>
    ep.path
      .split("/")
      .filter(Boolean)
      .map((segment) => (segment.startsWith(":") ? "1" : "0"))
      .join("");
  return rank(a).localeCompare(rank(b));
}

/** The query of a GET or DELETE; the JSON, form or upload of anything else — a QUERY's question included — which holds an object */
async function inputOf(
  c: Context,
  method: string,
  limits: BodyLimits | undefined,
): Promise<{ input: Record<string, unknown> } | { error: string; status: 400 | 413 }> {
  if (WITHOUT_BODY.has(method)) {
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
