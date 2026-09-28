/**
 * Mock HTTP server bootstrap — public entry point.
 *
 * Wires Hono middleware (logging, CORS), registers the proxy route, REST
 * routes, optional prefix-based routes, and the admin API, then exposes a
 * lifecycle (`start` / `stop`) and the underlying mock builder, store, and
 * scenario controls.
 *
 * Supporting pieces live in siblings:
 *
 * - `mock-server-types` — `MockServer`, `MockServerOptions` (re-exported below)
 * - `ws-attach`         — lazy WS upgrade handler creation + attachment
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

import { createHistory } from "../history";
import { createNetworkState } from "../network/state";
import { createMockRegistry } from "../registry";
import { createMockStore } from "../store";
import type { AnyMockScenario } from "../types";
import { registerAdminRoutes } from "./admin-api";
import { registerProxyRoute, registerProxySSERoute, registerRestRoutes } from "./api-routes";
import type { MockServer, MockServerOptions } from "./mock-server-types";
import { registerPrefixRoutes } from "./prefix-routes";
import type { MockLogMode } from "./request-logger";
import { createRequestLogger } from "./request-logger";
import type { RequestHooks } from "./route-generator";
import { handleMockRequest } from "./route-generator";
import { createScenarioControls } from "./scenario-controls";
import { createServerLifecycle } from "./server-lifecycle";

export type { MockServer, MockServerOptions } from "./mock-server-types";

/** @see {@link MockServerOptions} for full documentation */
export function createMockServer(config?: MockServerOptions): MockServer {
  const registry = createMockRegistry();
  const store = createMockStore();
  const history = createHistory(config?.historyLimit);
  const callCounts = new Map<string, number>();
  const scenariosRecord: Record<string, AnyMockScenario> = { ...config?.scenarios };
  const networkState = createNetworkState(config?.network);
  let scenarioState = "Started";
  let activeScenario: string | null = null;

  const app = new Hono();

  const logLevel = resolveLogLevel(config?.log);
  app.use("*", createRequestLogger(logLevel));

  if (config?.cors !== false) {
    const origin = typeof config?.cors === "object" ? config.cors.origin : "*";
    app.use("*", cors({ origin }));
  }

  const requestHooks: RequestHooks = {};

  const setScenarioState = (s: string) => {
    scenarioState = s;
  };

  const { mock, applyScenario: applyScenarioInternal } = createScenarioControls({
    registry,
    callCounts,
    setScenarioState,
  });

  const routeConfig = {
    registry,
    history,
    callCounts,
    getScenarioState: () => scenarioState,
    setScenarioState,
    network: config?.network,
    networkState,
    hooks: requestHooks,
  };

  registerProxyRoute(app, routeConfig);
  registerProxySSERoute(app, routeConfig);
  registerRestRoutes(app, routeConfig);

  if (config?.mappings?.length) {
    registerPrefixRoutes(app, config.mappings, {
      handleRequest: (c, group, method, variables) =>
        handleMockRequest(c, group, method, variables, routeConfig),
    });
  }

  if (config?.admin !== false) {
    const scenarioMap = new Map(Object.entries(scenariosRecord));

    registerAdminRoutes(app, {
      registry,
      history,
      store,
      scenarios: scenarioMap,
      getScenarioState: () => scenarioState,
      setScenarioState,
      getActiveScenario: () => activeScenario,
      setActiveScenario: (name) => {
        activeScenario = name;
      },
      applyScenario: (s) => applyScenarioInternal(s),
      reseed: config?.reseed,
    });
  }

  app.notFound((c) =>
    c.json({ error: `Route not found: ${c.req.method} ${new URL(c.req.url).pathname}` }, 404),
  );

  if (config?.scenario) {
    applyScenarioInternal(config.scenario);
  }

  const port = config?.port ?? 7001;
  const hostname = config?.hostname ?? "localhost";

  const lifecycle = createServerLifecycle(
    app,
    port,
    hostname,
    {
      registry,
      mappings: config?.mappings,
      history,
      getScenarioState: () => scenarioState,
      allowedOrigins: config?.ws?.allowedOrigins,
      maxPayload: config?.ws?.maxPayload,
    },
    config?.strictPort,
  );

  const mockServer: MockServer = {
    app,
    mock,
    store,
    history,
    scenarios: scenariosRecord,
    scenarioState: "Started",
    requestHooks,
    networkState,

    applyScenario(scenario) {
      applyScenarioInternal(scenario);
    },

    resetStore() {
      store.reset();
      config?.reseed?.();
    },

    getRouteSource(group, method) {
      if (registry.hasScenario(group, method)) return "scenario";
      if (registry.baseCount(group, method) > 1) return "override";
      return "auto";
    },

    ...lifecycle,
  };

  return mockServer;
}

function resolveLogLevel(log?: MockLogMode | boolean): MockLogMode {
  if (log === true) return "normal";
  if (log === false) return "silent";
  return log ?? "normal";
}
