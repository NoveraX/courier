import type { MockStore } from "../store";
import type { AnyMockScenario, UntypedMockFn } from "../types";
import { createHandler } from "./auto-handlers";
import { makeListHandler } from "./auto-list-handler";
import type { RouteInfo } from "./route-types";

/**
 * Build standard preset scenarios from analyzed routes.
 * These are available out of the box with createAutoMockServer.
 *
 * Each keeps the response shape its routes declare: a list that answers a
 * pagination wrapper answers one here too.
 */
export function buildPresetScenarios(
  routes: RouteInfo[],
  getStore: () => MockStore | undefined,
): Record<string, AnyMockScenario> {
  const listRoutes = routes.filter((r) => r.operation === "list");
  const readRoutes = routes.filter((r) => r.httpMethod === "GET" && r.transport === "http");

  return {
    empty: buildEmptyScenario(listRoutes),
    "server-error": buildErrorScenario(routes),
    "slow-network": buildSlowNetworkScenario(readRoutes, getStore),
  };
}

function buildEmptyScenario(listRoutes: RouteInfo[]): AnyMockScenario {
  return {
    name: "empty",
    description:
      "All list endpoints return no records, simulating a freshly initialized system with no data.",
    tags: ["data", "empty"],
    apply(mock: UntypedMockFn) {
      for (const route of listRoutes) {
        mock(route.group, route.endpoint).returns(makeListHandler(route, () => []));
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
      "Every endpoint fails with a server error, 500, 503 or 502 depending on the endpoint, simulating a fully degraded backend.",
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
  readRoutes: RouteInfo[],
  getStore: () => MockStore | undefined,
): AnyMockScenario {
  return {
    name: "slow-network",
    description:
      "Adds 3G latency (300–900 ms, with jitter) to every read endpoint to simulate a slow mobile connection; writes answer without it.",
    tags: ["latency", "network"],
    apply(mock: UntypedMockFn) {
      const store = getStore();
      if (!store) return;
      for (const route of readRoutes) {
        const handler = createHandler(store, route.group, route);
        if (handler) mock(route.group, route.endpoint).returns(handler).withLatency("3g");
      }
    },
  };
}
