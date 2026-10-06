import { scenarioRecord } from "../scenario/scenario-record";
import type { MockServer, MockServerOptions } from "../server/create-mock-server";
import { createMockServer } from "../server/create-mock-server";
import type { Elsewhere } from "../server/elsewhere";
import { generatedRoutes } from "../server/generated-routes";
import type { MockStore } from "../store";
import type { AnyMockScenario, NetworkConfig, UntypedMockFn } from "../types";
import { seedAllCollections } from "./auto-seed";
import { withBasePath } from "./base-path-mappings";
import { buildAutoHandlers } from "./build-auto-handlers";
import { checkedMock, withCheckedMock } from "./checked-mock-targets";
import { composeScenarios } from "./compose-scenarios";
import { createElsewhere } from "./create-elsewhere";
import { isApiDefinition } from "./is-api-definition";
import type { SeedConfig } from "./prefix-mappings";
import { buildPrefixMappings } from "./prefix-mappings";
import { buildPresetScenarios } from "./preset-scenarios";
import { analyzeRoutes, getSourceGroupNames } from "./route-analyzer";
import type { RouteInfo } from "./route-types";
import { seedOptionsOf } from "./seed-options";

/** Configuration for the auto-generated mock server */
export interface AutoMockServerConfig {
  /** API source definition — routes are auto-generated from this */
  source: Record<string, unknown>;
  /** Port to listen on (default: 7001) */
  port?: number | undefined;
  /** Fail when `port` is taken instead of moving to the next free one (default: false) */
  strictPort?: boolean | undefined;
  /** Ports the search for a free one passes over when `port` is taken (default: none) */
  avoidPorts?: readonly number[] | undefined;
  /** Hostname (default: "localhost") */
  hostname?: string | undefined;
  /** Enable CORS (default: true) */
  cors?: MockServerOptions["cors"] | undefined;
  /** Enable admin API (default: true) */
  admin?: boolean | undefined;
  /** Request logging level (default: "normal") */
  log?: MockServerOptions["log"] | undefined;
  /** The largest JSON body the mock reads, in bytes (default: 1 MB); see {@link MockServerOptions} */
  maxBodyBytes?: number | undefined;
  /** The largest form or upload the mock reads, in bytes (default: 10 MB); see {@link MockServerOptions} */
  maxUploadBytes?: number | undefined;
  /** Seed configuration */
  seed?: SeedConfig | undefined;
  /**
   * Override specific endpoints after auto-generation.
   * Handlers are registered in the base layer — they persist across all scenario switches.
   *
   * @param mock  Base-layer mock builder
   * @param store Mock store (for store-aware overrides)
   */
  overrides?: ((mock: UntypedMockFn, store: MockStore) => void) | undefined;
  /** Additional named scenarios (merged with built-in presets) */
  scenarios?: Record<string, AnyMockScenario> | undefined;
  /** Default network simulation (latency, errorRate, faultTypes) */
  network?: NetworkConfig | undefined;
  /**
   * Keep the store in a file, so its records survive a restart: each
   * collection the source serves takes the file's records for it when the
   * server starts, in place of its seeds. One the file has no records for
   * keeps them, and one the source no longer serves is not brought back.
   */
  persist?: { file: string } | undefined;
  /**
   * The endpoints the mock answers, as `group.method` — or the method alone
   * for one outside any group. Every other HTTP endpoint goes to the
   * source's own server, as the app calls it; streams and channels the mock
   * always answers. Default: every endpoint.
   */
  endpoints?: readonly string[] | undefined;
  /**
   * Answer with recordings of the source's own server, kept in this HAR
   * file: a call it has no answer to yet goes to the server once, and the
   * answer is written to the file. An override or a scenario wins over the
   * recordings. Default: the mock generates its answers from its store.
   */
  fixtures?: { file: string } | undefined;
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
  const mappings = withBasePath(buildPrefixMappings(config.source, routes), config.source);
  const seedOpts = seedOptionsOf(config.seed);

  // Late-bound store getter — shared by presets and reseed closure
  let storeRef: MockStore | undefined;
  const getStore = () => storeRef;

  const presets = buildPresetScenarios(routes, getStore);
  const groupNames = getSourceGroupNames(config.source);
  const guard = (mock: UntypedMockFn) => checkedMock(routes, groupNames, mock);
  const allScenarios = withCheckedMock(
    composeScenarios(presets, scenarioRecord(config.scenarios)),
    guard,
  );

  // reseed closure — storeRef is shared with the getStore getter above
  const reseed = () => {
    if (storeRef) seedAllCollections(routes, storeRef, seedOpts);
  };

  const server = createMockServer({
    port: config.port,
    strictPort: config.strictPort,
    avoidPorts: config.avoidPorts,
    hostname: config.hostname,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    network: config.network,
    maxBodyBytes: config.maxBodyBytes,
    maxUploadBytes: config.maxUploadBytes,
    mappings,
    scenarios: allScenarios,
    /* It starts as `happy-path`, the state with no scenario on top, so that
       one is in force and switching back to it turns any other off. */
    scenario: allScenarios["happy-path"],
    reseed,
    elsewhere: elsewhereOf(config, routes, groupNames),
    ...(config.persist && {
      persist: { file: config.persist.file, collections: [...new Set(routes.map((r) => r.group))] },
    }),
  });

  storeRef = server.store;

  // Seed collections on first start
  seedAllCollections(routes, server.store, seedOpts);

  // Register auto-CRUD handlers in the BASE layer via server.mock.
  // They persist across all scenario switches (switching to server-error, empty, etc.
  // writes to the scenario layer which has priority, but base is always the fallback).
  const generated = generatedRoutes(server);
  for (const key of buildAutoHandlers(routes, server.store, server.mock)) generated.add(key);

  // User overrides also go to the base layer, on top of auto-CRUD. A decorator-only
  // override (.withLatency, .withHeaders) builds on a copy of the auto-CRUD handler;
  // one that answers anew (.resolves, .returns, ...) replaces it.
  if (config.overrides) {
    config.overrides(guard(server.mock), server.store);
  }

  return server;
}

function elsewhereOf(
  config: AutoMockServerConfig,
  routes: readonly RouteInfo[],
  groupNames: ReadonlySet<string>,
): Elsewhere | undefined {
  if (config.endpoints === undefined && config.fixtures === undefined) return undefined;
  if (!isApiDefinition(config.source)) {
    throw new TypeError(
      "[courier-mock] A mock that passes calls on needs a source made with defineApi().",
    );
  }
  return createElsewhere({
    source: config.source,
    routes,
    groupNames,
    endpoints: config.endpoints,
    fixturesFile: config.fixtures?.file,
  });
}
