import { Hono } from "hono";
import { cors } from "hono/cors";
import { createEnhancedMockBuilder } from "../builder";
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
import type { LogLevel } from "./request-logger";
import { createRequestLogger } from "./request-logger";
import { registerProxyRoute, registerRestRoutes } from "./route-generator";

/** Configuration for the mock HTTP server */
export interface MockServerConfig {
  /** Port to listen on (default: 3001) */
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
}

/** Mock HTTP server instance */
export interface MockServer {
  /** Start the HTTP server */
  start(): Promise<{ port: number; url: string }>;
  /** Stop the server */
  stop(): Promise<void>;
  /** The Hono app (for custom routes) */
  app: Hono;
  /** Type-safe mock builder */
  mock: TypedMockFn<any>;
  /** Mock store */
  store: MockStore;
  /** Request history */
  history: MockHistoryEntry[];
  /** Apply a scenario */
  applyScenario(scenario: MockScenario): void;
  /** Current scenario state */
  scenarioState: string;
}

/**
 * Create a standalone HTTP mock server powered by Hono.
 *
 * @example
 * ```ts
 * const server = createMockServer({
 *   port: 3001,
 *   admin: true,
 *   network: { latency: "4g" },
 * });
 *
 * server.mock("users", "getAll").resolves([{ id: "1", name: "Alice" }]);
 * await server.start();
 * ```
 */
export function createMockServer(config?: MockServerConfig): MockServer {
  const registry = createMockRegistry();
  const store = createMockStore();
  const history: MockHistoryEntry[] = [];
  const callCounts = new Map<string, number>();
  let scenarioState = "Started";
  let server: { close: () => void } | undefined;

  const app = new Hono();

  // Logging
  const logLevel = resolveLogLevel(config?.log);
  app.use("*", createRequestLogger(logLevel));

  // CORS
  if (config?.cors !== false) {
    const origin = typeof config?.cors === "object" ? config.cors.origin : "*";
    app.use("*", cors({ origin }));
  }

  const routeConfig = {
    registry,
    history,
    callCounts,
    getScenarioState: () => scenarioState,
    setScenarioState: (s: string) => {
      scenarioState = s;
    },
    network: config?.network,
  };

  // Proxy route (POST /api/request)
  registerProxyRoute(app, routeConfig);

  // REST routes (POST/GET /api/:group/:method)
  registerRestRoutes(app, routeConfig);

  // Admin API
  if (config?.admin !== false) {
    const scenarioMap = new Map<string, MockScenario>();
    if (config?.scenarios) {
      for (const [name, s] of Object.entries(config.scenarios)) {
        scenarioMap.set(name, s);
      }
    }

    registerAdminRoutes(app, {
      registry,
      history,
      store,
      scenarios: scenarioMap,
      getScenarioState: () => scenarioState,
      setScenarioState: (s) => {
        scenarioState = s;
      },
      applyScenario: (s) => applyScenarioInternal(s),
    });
  }

  function mock(group: string, method: string): EnhancedMockBuilder {
    return createEnhancedMockBuilder((handler) => {
      registry.set(group, method, handler);
    });
  }

  function applyScenarioInternal(scenario: MockScenario): void {
    registry.clear();
    callCounts.clear();
    scenarioState = "Started";
    scenario.apply(mock as TypedMockFn<any>);
  }

  // Apply initial scenario
  if (config?.scenario) {
    applyScenarioInternal(config.scenario);
  }

  const port = config?.port ?? 3001;
  const hostname = config?.hostname ?? "localhost";

  const mockServer: MockServer = {
    app,
    mock: mock as TypedMockFn<any>,
    store,
    history,
    scenarioState: "Started",

    applyScenario(scenario) {
      applyScenarioInternal(scenario);
    },

    async start() {
      const { serve } = await import("@hono/node-server");
      return new Promise<{ port: number; url: string }>((resolve) => {
        const nodeServer = serve(
          { fetch: app.fetch, port, hostname: hostname === "localhost" ? "0.0.0.0" : hostname },
          (info) => {
            const actualPort = info.port;
            resolve({ port: actualPort, url: `http://localhost:${actualPort}` });
          },
        );
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
