import type { Context, Hono } from "hono";

import type { PathShape } from "./path-shape";
import { pathShape } from "./path-shape";
import type { MappedEndpoint, PrefixRouteConfig } from "./prefix-route-types";
import { parsePathParams, parseQueryParams } from "./route-helpers";

const METHODS = new Set<string>(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const WITHOUT_BODY = new Set<string>(["GET", "DELETE"]);

/* The shapes and methods the prefix catch-alls answer, with their
   by-convention fallbacks; every other endpoint gets a route of its own. */
const CATCH_ALL = new Map<PathShape, Set<string>>([
  ["collection", new Set(["GET", "POST", "DELETE"])],
  ["record", new Set(["GET", "PUT", "PATCH", "DELETE"])],
]);

/**
 * Register a route at its declared path for every HTTP endpoint the prefix
 * catch-alls do not answer: fixed sub-paths (`stats`), lookups
 * (`by-email/:email`), paths that go on past a parameter (`:id/orders`), and
 * methods the catch-alls leave out (`PUT` on the collection, `POST :id`).
 * The path's parameters join the query or body as variables.
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
    const path = `/${prefix}/${ep.path.split("/").filter(Boolean).join("/")}`;
    app.on(method, path, async (c) => {
      const input = await inputOf(c, method);
      if (!input) return c.json({ error: "The request body is not a JSON object" }, 400);
      return config.handleRequest(c, group, ep.name, {
        ...input,
        ...parsePathParams(c.req.param()),
      });
    });
  }
}

function needsOwnRoute(ep: MappedEndpoint): boolean {
  if (ep.transport === "sse" || ep.transport === "ws") return false;
  const method = (ep.httpMethod ?? "GET").toUpperCase();
  if (!METHODS.has(method)) return false;
  return !(CATCH_ALL.get(pathShape(ep.path))?.has(method) ?? false);
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

/** The query of a GET or DELETE, the JSON body of anything else; `undefined` for a body that is not JSON */
async function inputOf(c: Context, method: string): Promise<Record<string, unknown> | undefined> {
  if (WITHOUT_BODY.has(method)) return parseQueryParams(new URL(c.req.url).searchParams);
  const text = await c.req.text();
  if (!text.trim()) return {};
  const body = parseJson(text);
  return body && typeof body === "object" && !Array.isArray(body) ? { ...body } : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
