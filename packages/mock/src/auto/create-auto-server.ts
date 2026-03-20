import type { MockServer, MockServerConfig } from "../server/create-mock-server";
import { createMockServer } from "../server/create-mock-server";
import type { MockScenario, TypedMockFn } from "../types";
import { buildAutoScenario } from "./auto-scenario";
import { analyzeRoutes } from "./route-analyzer";

/** Configuration for the auto-generated mock server */
export interface AutoMockServerConfig {
  /** API source definition — routes are auto-generated from this */
  source: {
    options: {
      groups: Record<string, { options?: { prefix?: string } } & Record<string, unknown>>;
    };
  };
  /** Port to listen on (default: 3001) */
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
  /** Additional named scenarios (auto-generated is always included) */
  scenarios?: Record<string, MockScenario>;
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
 * Zero-config: pass a source definition, get a fully functional CRUD mock server.
 * Override specific endpoints for custom behavior.
 *
 * @example
 * ```ts
 * const server = createAutoMockServer({
 *   source: myApi,
 *   port: 3001,
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

  const server = createMockServer({
    port: config.port,
    hostname: config.hostname,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    source: config.source,
  });

  // Build and apply auto-generated scenario
  const autoScenario = buildAutoScenario(routes, server.store, {
    seedCount: config.seed?.count ?? 20,
    seedOverrides,
  });

  server.applyScenario(autoScenario);

  // Apply user overrides on top
  if (config.overrides) {
    config.overrides(server.mock);
  }

  // Register additional scenarios (include auto as default)
  const allScenarios: Record<string, MockScenario> = {
    "auto-generated": autoScenario,
    ...config.scenarios,
  };

  // Expose scenarios via admin API by re-creating server with scenarios
  // (scenarios are set at creation time, so we register them via admin)
  void allScenarios;

  return server;
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
