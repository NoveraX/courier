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
 * - `app-middleware`    — request logging and CORS
 * - `api-routes`        — the routes that answer mocked endpoints
 * - `ws-attach`         — lazy WS upgrade handler creation + attachment
 */

import { Hono } from "hono";

import { createHistory } from "../history";
import { createNetworkState } from "../network/state";
import { createMockRegistry } from "../registry";
import { createMockStore } from "../store";
import type { AnyMockScenario } from "../types";
import { registerAdminRoutes } from "./admin-api";
import { registerRequestRoutes } from "./api-routes";
import { applyMiddleware } from "./app-middleware";
import type { MockServer, MockServerOptions } from "./mock-server-types";
import type { RequestHooks } from "./route-generator";
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

  applyMiddleware(app, config);

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

  registerRequestRoutes(app, routeConfig, config?.mappings);

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
    requestHooks,
    networkState,

    get scenarioState() {
      return scenarioState;
    },

    /* Applied by name or by object alike, it becomes the one the admin API
       reports as current, as Studio's own apply does. */
    applyScenario(scenario) {
      applyScenarioInternal(scenario);
      activeScenario = scenario.name;
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
