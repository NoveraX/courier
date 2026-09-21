import type { MockServer, MockServerOptions } from "../server/create-mock-server";
import { createMockServer } from "../server/create-mock-server";
import type { MockStore } from "../store";
import type { MockScenario, NetworkConfig, TypedMockFn } from "../types";
import { buildAutoHandlers, seedAllCollections } from "./auto-scenario";
import type { SeedConfig } from "./prefix-mappings";
import { buildPrefixMappings, parseSeedConfig } from "./prefix-mappings";
import { buildPresetScenarios } from "./preset-scenarios";
import { analyzeRoutes, getSourceGroupNames } from "./route-analyzer";
import { toRouteInfo, wrapStartWithStudio } from "./studio-bridge-wrap";

// Re-export SeedConfig so external imports keep working unchanged.
export type { SeedConfig } from "./prefix-mappings";

/** Configuration for the auto-generated mock server */
export interface AutoMockServerConfig {
  /** API source definition — routes are auto-generated from this */
  source: Record<string, unknown>;
  /** Port to listen on (default: 7001) */
  port?: number;
  /** Hostname (default: "localhost") */
  hostname?: string;
  /** Enable CORS (default: true) */
  cors?: MockServerOptions["cors"];
  /** Enable admin API (default: true) */
  admin?: boolean;
  /** Request logging level (default: "normal") */
  log?: MockServerOptions["log"];
  /** Seed configuration */
  seed?: SeedConfig;
  /**
   * Override specific endpoints after auto-generation.
   * Handlers are registered in the base layer — they persist across all scenario switches.
   *
   * @param mock  Base-layer mock builder
   * @param store Mock store (for store-aware overrides)
   */
  overrides?: (mock: TypedMockFn<any>, store: MockStore) => void;
  /** Additional named scenarios (merged with built-in presets) */
  scenarios?: Record<string, MockScenario>;
  /** Default network simulation (latency, errorRate, faultTypes) */
  network?: NetworkConfig;
  /** Connect to Studio server (default: true) */
  studio?: boolean | { host?: string; port?: number; name?: string };
}

/**
 * Create a mock server with auto-generated routes and data from an API source.
 *
 * Zero-config: pass a source definition, get a fully functional CRUD mock server
 * with built-in scenarios (happy-path, empty, server-error, slow-network).
 * Override specific endpoints for custom behavior.
 *
 * ## Architecture
 * - Auto-CRUD handlers are registered in the **base layer** via `server.mock`.
 *   They survive all scenario switches.
 * - `overrides` are also in the base layer — always active regardless of active scenario.
 * - Scenarios write to the **scenario layer** (cleared on each switch).
 *   Scenario layer has resolution priority over base.
 * - `happy-path` is a no-op scenario that simply clears the scenario layer,
 *   letting the base auto-CRUD show through.
 *
 * @example
 * ```ts
 * const server = createAutoMockServer({
 *   source: myApi,
 *   port: 7001,
 *   seed: { count: 20, products: { count: 100 } },
 *   overrides: (mock, store) => {
 *     mock("orders", "create").returns((ctx) => {
 *       const vars = ctx.variables as { quantity?: number };
 *       if ((vars.quantity ?? 0) > 100) throw new Error("Max 100");
 *       return { ...ctx.variables, id: store.collection("orders").count() + 1 };
 *     });
 *   },
 * });
 * await server.start();
 * ```
 */
export function createAutoMockServer(config: AutoMockServerConfig): MockServer {
  const routes = analyzeRoutes(config.source);
  const mappings = buildPrefixMappings(config.source, routes);
  const seedOverrides = parseSeedConfig(config.seed);
  const seedOpts = { seedCount: config.seed?.count ?? 20, seedOverrides };

  // Late-bound store getter — shared by presets and reseed closure
  let storeRef: MockStore | undefined;
  const getStore = () => storeRef;

  const presets = buildPresetScenarios(routes, getStore);
  const allScenarios = composeScenarios(presets, config.scenarios);

  // reseed closure — storeRef is shared with the getStore getter above
  const reseed = () => {
    if (storeRef) seedAllCollections(routes, storeRef, seedOpts);
  };

  const server = createMockServer({
    port: config.port,
    hostname: config.hostname,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    network: config.network,
    mappings,
    scenarios: allScenarios,
    reseed,
  });

  storeRef = server.store;

  // Seed collections on first start
  seedAllCollections(routes, server.store, seedOpts);

  // Register auto-CRUD handlers in the BASE layer via server.mock.
  // They persist across all scenario switches (switching to server-error, empty, etc.
  // writes to the scenario layer which has priority, but base is always the fallback).
  buildAutoHandlers(routes, server.store, server.mock);

  // User overrides also go to the base layer, on top of auto-CRUD.
  // Since server.mock uses registry.peek() to find existing handlers, decorator-style
  // overrides (.withLatency, .withHeaders) will mutate the auto-CRUD handler in-place.
  if (config.overrides) {
    config.overrides(server.mock, server.store);
  }

  if (config.studio !== false) {
    const groupNames = getSourceGroupNames(config.source);
    const routeEntries = routes.map((r) => toRouteInfo(r, groupNames));
    wrapStartWithStudio(server, config, routeEntries, routes, allScenarios, reseed);
  }

  return server;
}

/**
 * Merge built-in presets and user scenarios under a canonical "happy-path".
 * happy-path is a no-op that clears the scenario layer, revealing base auto-CRUD;
 * user config cannot override it.
 */
function composeScenarios(
  presets: Record<string, MockScenario>,
  userScenarios?: Record<string, MockScenario>,
): Record<string, MockScenario> {
  const happyPath: MockScenario = { name: "happy-path", apply: () => {} };
  const merged = { ...userScenarios };
  delete merged["happy-path"];
  return {
    "happy-path": happyPath,
    ...presets,
    ...merged,
  };
}
