/**
 * Public configuration and server interface types for `createMockServer`.
 *
 * Re-exported from `create-mock-server.ts` so consumers continue to import
 * `MockServer` and `MockServerOptions` from there.
 */

import type { HeartbeatConfig } from "@noverax/courier/internal";
import type { Hono } from "hono";

import type { NetworkState } from "../network/state";
import type { MockStore } from "../store";
import type { StorePersistOptions } from "../store/store-persistence";
import type { AnyMockScenario, MockHistoryEntry, NetworkConfig, UntypedMockFn } from "../types";
import type { Elsewhere } from "./elsewhere";
import type { IdempotencyOptions } from "./idempotent-calls";
import type { PrefixMapping } from "./prefix-route-types";
import type { MockLogMode } from "./request-logger";
import type { RequestHooks } from "./route-types";

/** Configuration for the mock HTTP server */
export interface MockServerOptions {
  /** Port to listen on (default: 7001) */
  port?: number | undefined;
  /**
   * Fail to start when `port` is taken, instead of moving to the next free
   * one (default: false). For a port something else was told to call.
   */
  strictPort?: boolean | undefined;
  /**
   * Ports the search for a free one passes over when `port` is taken: ones
   * other servers were given and have not taken yet (default: none).
   */
  avoidPorts?: readonly number[] | undefined;
  /** Hostname (default: "localhost") */
  hostname?: string | undefined;
  /** Enable CORS (default: true) */
  cors?: boolean | { origin: string | string[] } | undefined;
  /** Enable admin API at /__admin/ (default: true) */
  admin?: boolean | undefined;
  /** Requests the history keeps, newest first to go last (default: 1000) */
  historyLimit?: number | undefined;
  /** Request logging level (default: "normal") */
  log?: MockLogMode | boolean | undefined;
  /** Default network simulation */
  /**
   * How a write's idempotency key is honoured: a write sent again with its
   * key gets the first answer back instead of running twice, as an API that
   * deduplicates by the key answers. `false` runs every write.
   */
  idempotency?: IdempotencyOptions | false | undefined;
  network?: NetworkConfig | undefined;
  /** Initial scenario */
  scenario?: AnyMockScenario | undefined;
  /** Named scenarios available via admin API */
  scenarios?: Record<string, AnyMockScenario> | undefined;
  /** Prefix mappings for REST-style routes (GET /products → products.getAll) */
  mappings?: PrefixMapping[] | undefined;
  /** Re-seed all collections after reset — provided by createAutoMockServer */
  reseed?: (() => void) | undefined;
  /**
   * Keep the store in a file, so its records survive a restart: taken from
   * the file when the server starts, and written back shortly after each
   * request that answers and when it stops. Left out, the store lives in
   * memory only.
   */
  persist?: StorePersistOptions | undefined;
  /**
   * WebSocket upgrade configuration.
   *
   * - `allowedOrigins` — `undefined` (default) accepts any origin,
   *   `string[]` enforces an exact-match allowlist; rejected upgrades return
   *   HTTP 403.
   * - `maxPayload` — maximum WebSocket frame size in bytes (default 1 MiB).
   * - `heartbeat` — how often each socket is pinged, and how long the mock
   *   waits for the pong before it closes the socket with 4408 (default
   *   every 25 s, 10 s to answer, as a Courier server).
   */
  ws?:
    | {
        allowedOrigins?: readonly string[] | undefined;
        maxPayload?: number | undefined;
        heartbeat?: HeartbeatConfig | undefined;
      }
    | undefined;
  /** The calls the mock leaves to its source's own server, or answers with recordings of it */
  elsewhere?: Elsewhere | undefined;
  /**
   * The largest JSON body the mock reads, in bytes (default: 1 MB, as a
   * Courier server). A larger one is answered with 413.
   */
  maxBodyBytes?: number | undefined;
  /**
   * The largest form or upload the mock reads, in bytes (default: 10 MB, as
   * a Courier server). A larger one is answered with 413.
   */
  maxUploadBytes?: number | undefined;
}

/** What answers a route of a mock. */
export type RouteSource = "auto" | "override" | "scenario" | "upstream" | "fixtures";

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
  /**
   * The scenario in force, by name — the one applied last, at start, by
   * `applyScenario` or through the admin API — or `null` while none is.
   */
  readonly activeScenario: string | null;
  /** All registered scenarios by name */
  scenarios: Record<string, AnyMockScenario>;
  /** Request lifecycle hooks — the worker Studio runs a mock in sets them to report each request */
  requestHooks: RequestHooks;
  /** Dynamic network simulation state — use for runtime config changes */
  networkState: NetworkState;
  /**
   * What answers a route: the generated handler, an override, the scenario
   * on, the source's own server it passes to, or the recordings of that
   * server it replays.
   */
  getRouteSource(group: string, method: string): RouteSource;
}
