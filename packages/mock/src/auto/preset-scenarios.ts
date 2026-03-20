import type { MockScenario, TypedMockFn } from "../types";
import type { RouteInfo } from "./route-analyzer";

/**
 * Build standard preset scenarios from analyzed routes.
 * These are available out of the box with createAutoMockServer.
 */
export function buildPresetScenarios(routes: RouteInfo[]): Record<string, MockScenario> {
  const listRoutes = routes.filter((r) => r.operation === "list");

  return {
    empty: buildEmptyScenario(listRoutes),
    "server-error": buildErrorScenario(listRoutes),
    "slow-network": buildSlowNetworkScenario(listRoutes),
  };
}

function buildEmptyScenario(listRoutes: RouteInfo[]): MockScenario {
  return {
    name: "empty",
    apply(mock: TypedMockFn<any>) {
      for (const route of listRoutes) {
        (mock as (g: string, m: string) => { resolves: (data: unknown) => void })(
          route.group,
          route.endpoint,
        ).resolves([]);
      }
    },
  };
}

function buildErrorScenario(listRoutes: RouteInfo[]): MockScenario {
  const errors = [
    { status: 500, message: "Database connection lost" },
    { status: 503, message: "Service temporarily unavailable" },
    { status: 502, message: "Upstream error" },
  ];

  return {
    name: "server-error",
    apply(mock: TypedMockFn<any>) {
      for (let i = 0; i < listRoutes.length; i++) {
        const route = listRoutes[i]!;
        const err = errors[i % errors.length]!;
        (mock as (g: string, m: string) => { rejects: (status: number, data: unknown) => void })(
          route.group,
          route.endpoint,
        ).rejects(err.status, { message: err.message });
      }
    },
  };
}

function buildSlowNetworkScenario(listRoutes: RouteInfo[]): MockScenario {
  return {
    name: "slow-network",
    apply(mock: TypedMockFn<any>) {
      for (const route of listRoutes) {
        (
          mock as (
            g: string,
            m: string,
          ) => { resolves: (data: unknown) => { withLatency: (p: string) => void } }
        )(route.group, route.endpoint)
          .resolves([])
          .withLatency("3g");
      }
    },
  };
}
