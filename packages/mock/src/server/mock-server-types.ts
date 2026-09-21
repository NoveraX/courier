/**
 * Public configuration and server interface types for `createMockServer`.
 *
 * Re-exported from `create-mock-server.ts` so consumers continue to import
 * `MockServer` and `MockServerOptions` from there.
 */

import type { Hono } from "hono";

import type { NetworkState } from "../network/state";
import type { MockStore } from "../store";
import type { MockHistoryEntry, MockScenario, NetworkConfig, TypedMockFn } from "../types";
import type { PrefixMapping } from "./prefix-routes";
import type { LogLevel } from "./request-logger";
import type { RequestHooks } from "./route-generator";

/** Configuration for the mock HTTP server */
export interface MockServerOptions {
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
  /** Request lifecycle hooks — set by studio bridge to emit events */
  requestHooks: RequestHooks;
  /** Dynamic network simulation state — use for runtime config changes */
  networkState: NetworkState;
  /** Determine the active source for a route: "auto" | "override" | "scenario" */
  getRouteSource(group: string, method: string): "auto" | "override" | "scenario";
}
