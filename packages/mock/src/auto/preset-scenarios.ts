import type { MockStore } from "../store";
import type { AnyMockScenario, UntypedMockFn } from "../types";
import type { RouteInfo } from "./route-analyzer";

/**
 * Build standard preset scenarios from analyzed routes.
 * These are available out of the box with createAutoMockServer.
 */
export function buildPresetScenarios(
  routes: RouteInfo[],
  getStore: () => MockStore | undefined,
): Record<string, AnyMockScenario> {
  const listRoutes = routes.filter((r) => r.operation === "list");

  return {
    empty: buildEmptyScenario(listRoutes),
    "server-error": buildErrorScenario(routes),
    "slow-network": buildSlowNetworkScenario(listRoutes, getStore),
  };
}

function buildEmptyScenario(listRoutes: RouteInfo[]): AnyMockScenario {
  return {
    name: "empty",
    description:
      "All list endpoints return empty arrays, simulating a freshly initialized system with no data.",
    tags: ["data", "empty"],
    apply(mock: UntypedMockFn) {
      for (const route of listRoutes) {
        mock(route.group, route.endpoint).resolves([]);
      }
    },
  };
}

function buildErrorScenario(routes: RouteInfo[]): AnyMockScenario {
  const errors = [
    { status: 500, message: "Database connection lost" },
    { status: 503, message: "Service temporarily unavailable" },
    { status: 502, message: "Upstream error" },
  ];

  return {
    name: "server-error",
    description:
      "All endpoints cycle through 500 / 503 / 502 errors, simulating a fully degraded backend.",
    tags: ["error", "critical"],
    apply(mock: UntypedMockFn) {
      // All routes fail — simulates a fully degraded backend
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const err = errors[i % errors.length];
        if (!route || !err) continue;
        mock(route.group, route.endpoint).rejects(err.status, { message: err.message });
      }
    },
  };
}

function buildSlowNetworkScenario(
  listRoutes: RouteInfo[],
  getStore: () => MockStore | undefined,
): AnyMockScenario {
  return {
    name: "slow-network",
    description:
      "Adds 3G-equivalent latency (~2000ms) to all read endpoints to simulate a slow mobile connection.",
    tags: ["latency", "network"],
    apply(mock: UntypedMockFn) {
      for (const route of listRoutes) {
        const group = route.group;
        mock(group, route.endpoint)
          .returns(() => getStore()?.collection(group).getAll() ?? [])
          .withLatency("3g");
      }
    },
  };
}
