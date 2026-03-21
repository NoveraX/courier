import { getSourceName } from "@noverax/nexus/define";
import { connectMockToDevTools } from "../devtools/bridge";
import type { MockRouteInfo } from "../devtools/types";
import type { MockServer, MockServerConfig } from "../server/create-mock-server";
import { createMockServer } from "../server/create-mock-server";
import type { MockScenario, TypedMockFn } from "../types";
import { buildAutoScenario, seedAllCollections } from "./auto-scenario";
import { buildPresetScenarios } from "./preset-scenarios";
import { analyzeRoutes } from "./route-analyzer";

/** Configuration for the auto-generated mock server */
export interface AutoMockServerConfig {
  /** API source definition — routes are auto-generated from this */
  source: {
    options: {
      groups: Record<string, { options?: { prefix?: string } } & Record<string, unknown>>;
    };
  };
  /** Port to listen on (default: 7001) */
  port?: number;
  /** Hostname (default: "localhost") */
  hostname?: string;
  /** Enable CORS (default: true) */
  cors?: MockServerConfig["cors"];
  /** Enable admin API (default: true) */
  admin?: boolean;
  /** Request logging level (default: "normal") */
  log?: MockServerConfig["log"];
  /** Seed configuration */
  seed?: SeedConfig;
  /** Override specific endpoints after auto-generation */
  overrides?: (mock: TypedMockFn<any>) => void;
  /** Additional named scenarios (merged with built-in presets) */
  scenarios?: Record<string, MockScenario>;
  /** Connect to DevTools server (default: true) */
  devtools?: boolean | { host?: string; port?: number; name?: string };
}

/** Seed data configuration */
export interface SeedConfig {
  /** Default records per collection (default: 20) */
  count?: number;
  /** Per-group overrides: `{ products: { count: 100 } }` */
  [groupName: string]: { count: number } | number | undefined;
}

/**
 * Create a mock server with auto-generated routes and data from an API source.
 *
 * Zero-config: pass a source definition, get a fully functional CRUD mock server
 * with built-in scenarios (happy-path, empty, server-error, slow-network).
 * Override specific endpoints for custom behavior.
 *
 * @example
 * ```ts
 * const server = createAutoMockServer({
 *   source: myApi,
 *   port: 7001,
 *   seed: { count: 20, products: { count: 100 } },
 *   overrides: (mock) => {
 *     mock("orders", "create").returns((ctx) => {
 *       if (ctx.variables.quantity > 100) throw new Error("Max 100");
 *       return { ...ctx.variables, id: 1, status: "pending" };
 *     });
 *   },
 * });
 * await server.start();
 * ```
 */
export function createAutoMockServer(config: AutoMockServerConfig): MockServer {
  const routes = analyzeRoutes(config.source.options.groups);
  const seedOverrides = parseSeedConfig(config.seed);

  const autoScenario = buildAutoScenario(routes);
  const presets = buildPresetScenarios(routes);

  const allScenarios: Record<string, MockScenario> = {
    "happy-path": autoScenario,
    ...presets,
    ...config.scenarios,
  };

  const server = createMockServer({
    port: config.port,
    hostname: config.hostname,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    source: config.source,
    scenarios: allScenarios,
  });

  // Eager seed — all collections populated at startup
  seedAllCollections(routes, server.store, {
    seedCount: config.seed?.count ?? 20,
    seedOverrides,
  });

  // Bind store and apply auto-scenario
  autoScenario.bindStore(server.store);
  server.applyScenario(autoScenario);

  // Apply user overrides on top
  if (config.overrides) {
    config.overrides(server.mock);
  }

  // Auto-connect to DevTools after start()
  if (config.devtools !== false) {
    const routeEntries = routes.map((r) => ({
      group: r.group,
      endpoint: r.endpoint,
      httpMethod: r.httpMethod,
      path: r.path,
      fullPath: r.fullPath,
      source: "auto" as const,
      hits: 0,
    }));
    wrapStartWithDevTools(server, config, routeEntries, Object.keys(allScenarios));
  }

  return server;
}

/** Wrap server.start() to auto-connect to DevTools after listening */
function wrapStartWithDevTools(
  server: MockServer,
  config: AutoMockServerConfig,
  routeEntries: MockRouteInfo[],
  scenarioNames: string[],
): void {
  const originalStart = server.start.bind(server);

  server.start = async () => {
    const info = await originalStart();

    const devtoolsOpts = typeof config.devtools === "object" ? config.devtools : {};
    const sourceName = getSourceName(config.source) ?? "mock";
    void connectMockToDevTools(server, {
      name: devtoolsOpts.name ?? sourceName,
      host: devtoolsOpts.host,
      port: devtoolsOpts.port,
      serverPort: info.port,
      serverUrl: info.url,
      routeCount: routeEntries.length,
      routes: routeEntries,
      scenarios: scenarioNames,
    });

    return info;
  };
}

/** Parse seed config into per-group count overrides */
function parseSeedConfig(seed?: SeedConfig): Record<string, number> {
  if (!seed) return {};

  const overrides: Record<string, number> = {};
  for (const [key, value] of Object.entries(seed)) {
    if (key === "count") continue;
    if (typeof value === "number") {
      overrides[key] = value;
    } else if (value && typeof value === "object" && "count" in value) {
      overrides[key] = value.count;
    }
  }
  return overrides;
}
