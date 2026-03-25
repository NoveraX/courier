import { getSourceName } from "@noverax/nexus/define";
import { connectMockToDevTools } from "../devtools/bridge";
import type { MockRouteInfo } from "../devtools/types";
import type { MockServer, MockServerConfig } from "../server/create-mock-server";
import { createMockServer } from "../server/create-mock-server";
import type { PrefixMapping } from "../server/prefix-routes";
import type { MockStore } from "../store";
import type { MockScenario, NetworkConfig, TypedMockFn } from "../types";
import { buildAutoHandlers, seedAllCollections } from "./auto-scenario";
import { generateRecords } from "./data-generator";
import { buildPresetScenarios } from "./preset-scenarios";
import type { RouteInfo } from "./route-analyzer";
import { analyzeRoutes, getSourceGroupNames } from "./route-analyzer";
import { analyzeField, extractShape, unwrapArraySchema } from "./schema-introspect";

/** Configuration for the auto-generated mock server */
export interface AutoMockServerConfig {
  /** API source definition — routes are auto-generated from this */
  source: Record<string, unknown>;
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
 *       if ((ctx.variables as any).quantity > 100) throw new Error("Max 100");
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

  // happy-path = no-op: clearing the scenario layer reveals the base auto-CRUD
  const happyPath: MockScenario = { name: "happy-path", apply: () => {} };

  // happy-path is always the canonical "reset to defaults" — user config cannot override it
  const userScenarios = { ...config.scenarios };
  delete userScenarios["happy-path"];

  const allScenarios: Record<string, MockScenario> = {
    "happy-path": happyPath,
    ...presets,
    ...userScenarios,
  };

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

  if (config.devtools !== false) {
    const groupNames = getSourceGroupNames(config.source);
    const routeEntries = routes.map((r) => toRouteInfo(r, groupNames));
    wrapStartWithDevTools(server, config, routeEntries, routes, allScenarios, reseed);
  }

  return server;
}

/** Wrap server.start() to auto-connect to DevTools after listening */
function wrapStartWithDevTools(
  server: MockServer,
  config: AutoMockServerConfig,
  routeEntries: MockRouteInfo[],
  analyzedRoutes: RouteInfo[],
  allScenarios: Record<string, MockScenario>,
  reseed: () => void,
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
      analyzedRoutes,
      scenarios: Object.keys(allScenarios),
      scenarioMap: allScenarios,
      reseed,
    });

    return info;
  };
}

/** Convert analyzed RouteInfo → serializable MockRouteInfo with schema + example */
function toRouteInfo(r: RouteInfo, groupNames: Set<string>): MockRouteInfo {
  const entry: MockRouteInfo = {
    group: groupNames.has(r.group) ? r.group : "",
    endpoint: r.endpoint,
    httpMethod: r.httpMethod,
    path: r.path,
    fullPath: r.fullPath,
    source: "auto",
    hits: 0,
  };

  if (r.responseSchema) {
    entry.responseSchema = serializeSchema(r.responseSchema);
    try {
      const records = generateRecords(r.responseSchema, 1);
      entry.exampleResponse = r.operation === "list" ? records : records[0];
    } catch {
      // Schema may not be introspectable — skip example
    }
  }

  return entry;
}

/** Serialize Standard Schema shape → simple { field: type } map for UI display */
function serializeSchema(schema: unknown): Record<string, string> | undefined {
  const itemSchema = unwrapArraySchema(schema) ?? schema;
  const shape = extractShape(itemSchema);
  if (!shape) return undefined;

  const result: Record<string, string> = {};
  for (const [key, field] of Object.entries(shape)) {
    const meta = analyzeField(field);
    result[key] =
      meta.type === "optional" || meta.type === "nullable"
        ? `${meta.innerField?.type ?? "unknown"}?`
        : meta.type;
  }
  return result;
}

// ── Prefix Mappings ─────────────────────────────────────────────────────────

/**
 * Build PrefixMappings from analyzed routes and source structure.
 * Includes httpMethod on each MappedEndpoint so static sub-paths
 * can be registered with the correct HTTP verb.
 */
function buildPrefixMappings(
  source: Record<string, unknown>,
  routes: RouteInfo[],
): PrefixMapping[] {
  const opts = source.options as
    | { groups?: Record<string, { options?: { prefix?: string } }> }
    | undefined;
  const groups = opts?.groups ?? {};
  const groupNames = new Set(Object.keys(groups).filter((k) => k !== "options"));

  const mappings: PrefixMapping[] = [];
  const byGroup = new Map<string, PrefixMapping>();

  for (const route of routes) {
    const ep = {
      name: route.endpoint,
      operation: route.operation,
      path: route.path,
      httpMethod: route.httpMethod,
    };
    const existing = byGroup.get(route.group);
    if (existing) {
      existing.methods.push(route.endpoint);
      existing.endpoints?.push(ep);
      continue;
    }

    const isGrouped = groupNames.has(route.group);
    const prefix = isGrouped
      ? (groups[route.group]?.options?.prefix ?? `/${route.group}`)
      : `/${route.group}`;

    const mapping: PrefixMapping = {
      prefix,
      group: route.group,
      methods: [route.endpoint],
      endpoints: [ep],
    };
    byGroup.set(route.group, mapping);
    mappings.push(mapping);
  }

  return mappings;
}

// ── Seed Config ─────────────────────────────────────────────────────────────

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
