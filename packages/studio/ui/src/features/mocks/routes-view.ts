import type { MockRouteEntry } from "@/store/mock-slice";

/** What answers a route: the generated handler, an override, a scenario's, the source's own server, or recordings of it. */
export const ROUTE_KINDS = ["all", "auto", "override", "scenario", "upstream", "fixtures"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

/** The Routes tab's part of the address, each left out while it is the default. */
export interface MockRoutesSearch {
  q?: string | undefined;
  kind?: Exclude<RouteKind, "all"> | undefined;
  /** The route open, as `METHOD path`. */
  open?: string | undefined;
}

/**
 * Read the Routes tab's parameters from its address.
 *
 * @param raw - The address's parameters
 * @returns The search, the kind and the route open, when they differ from the defaults
 * @example
 * ```ts
 * validateMockRoutesSearch({ kind: "override", q: "users" }); // { q: "users", kind: "override" }
 * ```
 */
export function validateMockRoutesSearch(raw: Record<string, unknown>): MockRoutesSearch {
  const search: MockRoutesSearch = {};
  if (typeof raw.q === "string" && raw.q) search.q = raw.q;
  const kind = ROUTE_KINDS.find((k) => k !== "all" && k === raw.kind);
  if (kind && kind !== "all") search.kind = kind;
  if (typeof raw.open === "string" && raw.open) search.open = raw.open;
  return search;
}

/**
 * A route's key in the list: its method and full path.
 *
 * @param route - The route
 * @returns `GET /api/users/:id`
 * @example
 * ```ts
 * routeKeyOf(route); // "GET /api/users/:id"
 * ```
 */
export function routeKeyOf(route: Pick<MockRouteEntry, "httpMethod" | "fullPath">): string {
  return `${route.httpMethod.toUpperCase()} ${route.fullPath}`;
}

/**
 * How many routes each kind of handler answers.
 *
 * @param routes - The server's routes
 * @returns The count per kind, all of them under `all`
 * @example
 * ```ts
 * routeKindCounts(routes); // { all: 16, auto: 11, override: 2, scenario: 3, upstream: 0, fixtures: 0 }
 * ```
 */
export function routeKindCounts(routes: readonly MockRouteEntry[]): Record<RouteKind, number> {
  const counts = {
    all: routes.length,
    auto: 0,
    override: 0,
    scenario: 0,
    upstream: 0,
    fixtures: 0,
  };
  for (const route of routes) counts[route.source] += 1;
  return counts;
}

/**
 * The routes of a kind whose path or endpoint matches the search.
 *
 * @param routes - The server's routes
 * @param query - The search
 * @param kind - The kind
 * @returns The routes, in the server's order
 * @example
 * ```ts
 * filterRoutes(routes, "users", "auto").length; // 3
 * ```
 */
export function filterRoutes(
  routes: readonly MockRouteEntry[],
  query: string,
  kind: RouteKind,
): MockRouteEntry[] {
  const q = query.trim().toLowerCase();
  return routes.filter(
    (r) =>
      (kind === "all" || r.source === kind) &&
      (!q ||
        r.fullPath.toLowerCase().includes(q) ||
        `${r.group}.${r.endpoint}`.toLowerCase().includes(q)),
  );
}
