import { Hono } from "hono";
import { cors } from "hono/cors";
import { createEnhancedMockBuilder } from "../builder";
import type { NetworkState } from "../network/state";
import { createNetworkState } from "../network/state";
import { createMockRegistry } from "../registry";
import type { MockStore } from "../store";
import { createMockStore } from "../store";
import type {
  EnhancedMockBuilder,
  MockHistoryEntry,
  MockScenario,
  NetworkConfig,
  TypedMockFn,
} from "../types";
import { registerAdminRoutes } from "./admin-api";
import type { PrefixMapping } from "./prefix-routes";
import { registerPrefixRoutes } from "./prefix-routes";
import type { LogLevel } from "./request-logger";
import { createRequestLogger } from "./request-logger";
import type { RequestHooks } from "./route-generator";
import { handleMockRequest, registerProxyRoute, registerRestRoutes } from "./route-generator";
import { tryListen } from "./try-listen";

/** Configuration for the mock HTTP server */
export interface MockServerConfig {
  /** Port to listen on (default: 7001) */
  port?: number;
  /** Hostname (default: "localhost") */
  hostname?: string;
  /** Enable CORS (default: true) */
  cors?: boolean | { origin: string | string[] };
  /** Enable admin API at /__admin/ (default: true) */
  admin?: boolean;
  /** Request logging level (default: "normal") */
  log?: LogLevel | boolean;
  /** Default network simulation */
  network?: NetworkConfig;
  /** Initial scenario */
  scenario?: MockScenario;
  /** Named scenarios available via admin API */
  scenarios?: Record<string, MockScenario>;
  /** Prefix mappings for REST-style routes (GET /products → products.getAll) */
  mappings?: PrefixMapping[];
  /** Re-seed all collections after reset — provided by createAutoMockServer */
  reseed?: () => void;
}

/** Mock HTTP server instance */
export interface MockServer {
  /** Start the HTTP server */
  start(): Promise<{ port: number; url: string }>;
  /** Stop the server */
  stop(): Promise<void>;
  /** The Hono app (for custom routes) */
  app: Hono;
  /** Base-layer mock builder — persists across scenario switches */
  mock: TypedMockFn<any>;
  /** Mock store */
  store: MockStore;
  /** Request history */
  history: MockHistoryEntry[];
  /** Apply a scenario (clears scenario layer, base layer untouched) */
  applyScenario(scenario: MockScenario): void;
  /** Current scenario state */
  scenarioState: string;
  /** All registered scenarios by name */
  scenarios: Record<string, MockScenario>;
  /** Request lifecycle hooks — set by devtools bridge to emit events */
  requestHooks: RequestHooks;
  /** Dynamic network simulation state — use for runtime config changes */
  networkState: NetworkState;
  /** Determine the active source for a route: "auto" | "override" | "scenario" */
  getRouteSource(group: string, method: string): "auto" | "override" | "scenario";
}

/** @see {@link MockServerConfig} for full documentation */
export function createMockServer(config?: MockServerConfig): MockServer {
  const registry = createMockRegistry();
  const store = createMockStore();
  const history: MockHistoryEntry[] = [];
  const callCounts = new Map<string, number>();
  const scenariosRecord: Record<string, MockScenario> = { ...config?.scenarios };
  const networkState = createNetworkState(config?.network);
  let scenarioState = "Started";
  let activeScenario: string | null = null;
  let server: { close: () => void } | undefined;

  const app = new Hono();

  const logLevel = resolveLogLevel(config?.log);
  app.use("*", createRequestLogger(logLevel));

  if (config?.cors !== false) {
    const origin = typeof config?.cors === "object" ? config.cors.origin : "*";
    app.use("*", cors({ origin }));
  }

  const requestHooks: RequestHooks = {};

  const routeConfig = {
    registry,
    history,
    callCounts,
    getScenarioState: () => scenarioState,
    setScenarioState: (s: string) => {
      scenarioState = s;
    },
    network: config?.network,
    networkState,
    hooks: requestHooks,
  };

  registerProxyRoute(app, routeConfig);
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
      setScenarioState: (s) => {
        scenarioState = s;
      },
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

  function mock(group: string, method: string): EnhancedMockBuilder {
    const existing = registry.peek(group, method);
    return createEnhancedMockBuilder((handler) => {
      registry.setBase(group, method, handler);
    }, existing);
  }

  function scenarioMock(group: string, method: string): EnhancedMockBuilder {
    return createEnhancedMockBuilder((handler) => {
      registry.set(group, method, handler);
    });
  }

  function applyScenarioInternal(scenario: MockScenario): void {
    registry.clear();
    callCounts.clear();
    scenarioState = scenario.initialState ?? "Started";
    scenario.apply(scenarioMock as TypedMockFn<any>);
  }

  if (config?.scenario) {
    applyScenarioInternal(config.scenario);
  }

  const port = config?.port ?? 7001;
  const hostname = config?.hostname ?? "localhost";

  const mockServer: MockServer = {
    app,
    mock: mock as TypedMockFn<any>,
    store,
    history,
    scenarios: scenariosRecord,
    scenarioState: "Started",
    requestHooks,
    networkState,

    applyScenario(scenario) {
      applyScenarioInternal(scenario);
    },

    getRouteSource(group, method) {
      if (registry.hasScenario(group, method)) return "scenario";
      if (registry.baseCount(group, method) > 1) return "override";
      return "auto";
    },

    async start() {
      const { serve } = await import("@hono/node-server");
      return tryListen(serve, app, port, hostname, (nodeServer) => {
        server = nodeServer;
      });
    },

    async stop() {
      if (server && "close" in server) {
        server.close();
      }
      server = undefined;
    },
  };

  return mockServer;
}

function resolveLogLevel(log?: LogLevel | boolean): LogLevel {
  if (log === true) return "normal";
  if (log === false) return "silent";
  return log ?? "normal";
}
