import type { MockStore } from "../store";
import type { MockRequestContext, MockScenario, TypedMockFn } from "../types";
import { createHandler } from "./auto-handlers";
import type { RouteInfo } from "./route-analyzer";

// Re-export the seed API and its options type so external imports keep working.
export type { AutoScenarioOptions } from "./auto-seed";
export { seedAllCollections } from "./auto-seed";

/** Auto-scenario with late-bound store */
export interface AutoMockScenario extends MockScenario {
  /** Bind the store after server creation */
  bindStore(store: MockStore): void;
}

/**
 * Build a CRUD scenario from analyzed routes.
 * Handlers work with pre-seeded store (no lazy init).
 */
export function buildAutoScenario(routes: RouteInfo[]): AutoMockScenario {
  let boundStore: MockStore | undefined;

  const routesByGroup = groupRoutesByName(routes);

  return {
    name: "auto-generated",

    bindStore(store: MockStore) {
      boundStore = store;
    },

    apply(mock: TypedMockFn<any>) {
      if (!boundStore) {
        throw new Error("[courier-mock] Auto-scenario store not bound.");
      }
      registerHandlers(routesByGroup, boundStore, mock);
    },
  };
}

/**
 * Register auto-CRUD handlers directly via the given mock function.
 * Use this to populate the base layer in createAutoMockServer so handlers
 * survive scenario switches.
 */
export function buildAutoHandlers(
  routes: RouteInfo[],
  store: MockStore,
  mock: TypedMockFn<any>,
): void {
  const routesByGroup = groupRoutesByName(routes);
  registerHandlers(routesByGroup, store, mock);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type MockReturnsTarget = (
  group: string,
  method: string,
) => { returns: (fn: (ctx: MockRequestContext) => unknown) => void };

function registerHandlers(
  routesByGroup: Map<string, RouteInfo[]>,
  store: MockStore,
  mock: TypedMockFn<any>,
): void {
  const target = mock as unknown as MockReturnsTarget;
  for (const [groupName, groupRoutes] of routesByGroup) {
    for (const route of groupRoutes) {
      const handler = createHandler(store, groupName, route);
      if (handler) {
        target(groupName, route.endpoint).returns(handler);
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
