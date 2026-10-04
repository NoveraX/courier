import type { MockStore } from "../store";
import type { UntypedMockFn } from "../types";
import { createHandler } from "./auto-handlers";
import type { RouteInfo } from "./route-types";

/**
 * Register auto-CRUD handlers directly via the given mock function.
 * Use this to populate the base layer in createAutoMockServer so handlers
 * survive scenario switches.
 */
export function buildAutoHandlers(
  routes: RouteInfo[],
  store: MockStore,
  mock: UntypedMockFn,
): void {
  const routesByGroup = groupRoutesByName(routes);
  registerHandlers(routesByGroup, store, mock);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function registerHandlers(
  routesByGroup: Map<string, RouteInfo[]>,
  store: MockStore,
  mock: UntypedMockFn,
): void {
  for (const [groupName, groupRoutes] of routesByGroup) {
    for (const route of groupRoutes) {
      const handler = createHandler(store, groupName, route);
      if (handler) {
        mock(groupName, route.endpoint).returns(handler);
      }
    }
  }
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
