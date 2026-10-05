import { routeKey } from "../server/generated-routes";
import type { MockStore } from "../store";
import type { UntypedMockFn } from "../types";
import { createHandler } from "./auto-handlers";
import type { RouteInfo } from "./route-types";

/**
 * Register auto-CRUD handlers directly via the given mock function.
 * Use this to populate the base layer in createAutoMockServer so handlers
 * survive scenario switches. A stream or a channel gets none: it answers
 * only once a handler of the user's is given.
 *
 * @param routes - The source's routes
 * @param store - The store the handlers read and write
 * @param mock - The base layer's builder
 * @returns The `group/method` keys of the routes it registered a handler for
 * @example
 * ```ts
 * const generated = buildAutoHandlers(routes, server.store, server.mock);
 * ```
 */
export function buildAutoHandlers(
  routes: RouteInfo[],
  store: MockStore,
  mock: UntypedMockFn,
): string[] {
  const routesByGroup = groupRoutesByName(routes);
  return registerHandlers(routesByGroup, store, mock);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function registerHandlers(
  routesByGroup: Map<string, RouteInfo[]>,
  store: MockStore,
  mock: UntypedMockFn,
): string[] {
  const registered: string[] = [];
  for (const [groupName, groupRoutes] of routesByGroup) {
    for (const route of groupRoutes) {
      const handler = createHandler(store, groupName, route);
      if (handler) {
        mock(groupName, route.endpoint).returns(handler);
        registered.push(routeKey(groupName, route.endpoint));
      }
    }
  }
  return registered;
}

function groupRoutesByName(routes: RouteInfo[]): Map<string, RouteInfo[]> {
  const map = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const existing = map.get(route.group) ?? [];
    existing.push(route);
    map.set(route.group, existing);
  }
  return map;
}
