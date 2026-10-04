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
import { createScenarioState } from "../scenario/scenario-state";
import { createMockStore } from "../store";
import type { AnyMockScenario } from "../types";
import { registerAdminRoutes } from "./admin-api";
import { registerRequestRoutes } from "./api-routes";
import { applyMiddleware } from "./app-middleware";
import type { MockServer, MockServerOptions } from "./mock-server-types";
import { persistedStore } from "./persisted-store";
import type { RequestHooks } from "./route-types";
import { createScenarioControls } from "./scenario-controls";
import { createServerLifecycle } from "./server-lifecycle";
import { createStreamStopper } from "./stream-stopper";

export type { MockServer, MockServerOptions } from "./mock-server-types";

/** @see {@link MockServerOptions} for full documentation */
export function createMockServer(config?: MockServerOptions): MockServer {
  const registry = createMockRegistry();
  const store = createMockStore();
  const history = createHistory(config?.historyLimit);
  const callCounts = new Map<string, number>();
  const scenariosRecord: Record<string, AnyMockScenario> = { ...config?.scenarios };
  const networkState = createNetworkState(config?.network);
  const scenario = createScenarioState();
  let activeScenario: string | null = null;

  const app = new Hono();

  applyMiddleware(app, config);
  const persistence = persistedStore(app, store, config?.persist);

  const requestHooks: RequestHooks = {};
  const streams = createStreamStopper();

  const setScenarioState = scenario.set;

  const { mock, applyScenario: applyScenarioInternal } = createScenarioControls({
    registry,
    callCounts,
    setScenarioState,
  });

  const routeConfig = {
    registry,
    history,
    callCounts,
    getScenarioState: scenario.get,
    setScenarioState,
    markScenario: scenario.mark,
    transitionScenario: scenario.transition,
    network: config?.network,
    networkState,
    hooks: requestHooks,
    streamsStopping: streams.signal,
  };

  registerRequestRoutes(app, routeConfig, config?.mappings);

  if (config?.admin !== false) {
    const scenarioMap = new Map(Object.entries(scenariosRecord));

    registerAdminRoutes(app, {
      registry,
      history,
      store,
      scenarios: scenarioMap,
      getScenarioState: scenario.get,
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
      getScenarioState: scenario.get,
      allowedOrigins: config?.ws?.allowedOrigins,
      maxPayload: config?.ws?.maxPayload,
      hooks: requestHooks,
    },
    config?.strictPort,
    streams.stopAll,
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
      return scenario.get();
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
      persistence?.schedule();
    },

    saveStore: async () => {
      await persistence?.flush();
    },

    getRouteSource(group, method) {
      if (registry.hasScenario(group, method)) return "scenario";
      if (registry.baseCount(group, method) > 1) return "override";
      return "auto";
    },

    ...lifecycle,

    start: async () => {
      persistence?.restore();
      return lifecycle.start();
    },

    stop: async () => {
      await lifecycle.stop();
      await persistence?.flush();
    },
  };

  return mockServer;
}
