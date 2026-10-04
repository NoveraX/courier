/**
 * Public configuration and server interface types for `createMockServer`.
 *
 * Re-exported from `create-mock-server.ts` so consumers continue to import
 * `MockServer` and `MockServerOptions` from there.
 */

import type { Hono } from "hono";

import type { NetworkState } from "../network/state";
import type { MockStore } from "../store";
import type { StorePersistOptions } from "../store/store-persistence";
import type { AnyMockScenario, MockHistoryEntry, NetworkConfig, UntypedMockFn } from "../types";
import type { PrefixMapping } from "./prefix-route-types";
import type { MockLogMode } from "./request-logger";
import type { RequestHooks } from "./route-types";

/** Configuration for the mock HTTP server */
export interface MockServerOptions {
  /** Port to listen on (default: 7001) */
  port?: number;
  /**
   * Fail to start when `port` is taken, instead of moving to the next free
   * one (default: false). For a port something else was told to call.
   */
  strictPort?: boolean;
  /** Hostname (default: "localhost") */
  hostname?: string;
  /** Enable CORS (default: true) */
  cors?: boolean | { origin: string | string[] };
  /** Enable admin API at /__admin/ (default: true) */
  admin?: boolean;
  /** Requests the history keeps, newest first to go last (default: 1000) */
  historyLimit?: number;
  /** Request logging level (default: "normal") */
  log?: MockLogMode | boolean;
  /** Default network simulation */
  network?: NetworkConfig;
  /** Initial scenario */
  scenario?: AnyMockScenario;
  /** Named scenarios available via admin API */
  scenarios?: Record<string, AnyMockScenario>;
  /** Prefix mappings for REST-style routes (GET /products → products.getAll) */
  mappings?: PrefixMapping[];
  /** Re-seed all collections after reset — provided by createAutoMockServer */
  reseed?: () => void;
  /**
   * Keep the store in a file, so its records survive a restart: taken from
   * the file when the server starts, and written back shortly after each
   * request that answers and when it stops. Left out, the store lives in
   * memory only.
   */
  persist?: StorePersistOptions;
  /**
   * WebSocket upgrade configuration.
   *
   * - `allowedOrigins` — `undefined` (default) accepts any origin,
   *   `string[]` enforces an exact-match allowlist; rejected upgrades return
   *   HTTP 403.
   * - `maxPayload` — maximum WebSocket frame size in bytes (default 1 MiB).
   */
  ws?: {
    allowedOrigins?: readonly string[];
    maxPayload?: number;
  };
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
  mock: UntypedMockFn;
  /** Mock store */
  store: MockStore;
  /**
   * Empty the store and seed it again, as it was when the server started — a
   * server built from a source reseeds its collections, any other is left
   * empty. Handlers, scenarios, history and network settings are untouched.
   */
  resetStore(): void;
  /**
   * Write the store to its `persist` file now, rather than shortly after a
   * request: for a change made outside one. Resolves at once for a server
   * that keeps no file.
   */
  saveStore(): Promise<void>;
  /** Request history */
  history: MockHistoryEntry[];
  /** Apply a scenario (clears scenario layer, base layer untouched) */
  applyScenario(scenario: AnyMockScenario): void;
  /**
   * Current scenario state, read when accessed: it follows `transitionTo`, an
   * applied scenario's `initialState` and the admin API's resets.
   */
  readonly scenarioState: string;
  /** All registered scenarios by name */
  scenarios: Record<string, AnyMockScenario>;
  /** Request lifecycle hooks — the worker Studio runs a mock in sets them to report each request */
  requestHooks: RequestHooks;
  /** Dynamic network simulation state — use for runtime config changes */
  networkState: NetworkState;
  /** Determine the active source for a route: "auto" | "override" | "scenario" */
  getRouteSource(group: string, method: string): "auto" | "override" | "scenario";
}
