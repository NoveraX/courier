import type { AnySource } from "@noverax/courier/define";
import type { KeptBodies } from "@noverax/courier/internal";
import type { AutoScenarioOptions } from "../auto/auto-seed";
import type { RouteInfo } from "../auto/route-types";
import type { IdempotencyOptions } from "../server/idempotent-calls";
import type { MockServer } from "../server/mock-server-types";
import type { MockStore } from "../store";
import type { EndpointName, TypedMockFn } from "../typed-mock-fn";
import type { MockScenario, NetworkConfig } from "../types";
import type { DescribedRoute } from "./describe-route";
import type { StoreFeed } from "./store-feed";

/**
 * What `defineMocks` accepts under each key: a `defineMockServer()` result,
 * for any source. It names only what every definition shares, so definitions
 * written for different APIs fit one record.
 */
export interface MockServerEntry {
  readonly __type: "courier-mock-server";
  /** The API the mock serves. */
  readonly source: AnySource;
}

/**
 * What `defineMockServer()` returns: a mock server for `TSource`, which Studio
 * runs when it is declared in `courier.mocks.ts`.
 */
export interface MockServerDefinition<TSource extends AnySource = AnySource>
  extends MockServerEntry {
  /** Marker for runtime type detection */
  __type: "courier-mock-server";
  /** The API to mock — grouped or flat; its routes and data are generated from it */
  source: TSource;
  /**
   * Port to listen on. Studio holds a mock to it and reports it when it is
   * taken; left out, Studio assigns one from `studio.mockBasePort`.
   */
  port?: number | undefined;
  /**
   * Where to listen (default: `"localhost"`, loopback only). Use `"0.0.0.0"`
   * to reach the mock from another machine or a container — its admin API,
   * which has no authentication, is then reachable there too.
   */
  hostname?: string | undefined;
  /** Seed configuration */
  seed?: MockServerSeedConfig | undefined;
  /** Start automatically when Studio launches (default: false) */
  autoStart: boolean;
  /**
   * Endpoint overrides applied after auto-generation — persist across all
   * scenario switches. `mock` takes the source's group and endpoint names.
   */
  overrides?: ((mock: TypedMockFn<NoInfer<TSource>>, store: MockStore) => void) | undefined;
  /**
   * Named scenarios, each written for this source or for none (happy-path is
   * auto-generated from the source).
   */
  scenarios?: Record<string, MockScenario<NoInfer<TSource>>> | undefined;
  /** Default network simulation */
  network?: NetworkConfig | undefined;
  /**
   * The endpoints the mock answers, as `group.method` — or the method alone
   * for one outside any group. Every other HTTP endpoint goes to the
   * source's own server at its `baseURL`, as the app calls it, so a mock can
   * stand in for the few endpoints a backend does not have yet. Streams and
   * channels the mock always answers. Default: every endpoint.
   */
  endpoints?: readonly EndpointName<NoInfer<TSource>>[] | undefined;
  /**
   * Answer with recordings of the source's own server, kept in this HAR
   * file, relative to the mocks file: a call the mock has no answer to yet
   * goes to the server once, and the answer is written to the file — for
   * demos and tests that see the same data every time. An override or a
   * scenario wins over the recordings. Default: the mock generates its
   * answers and keeps what is created in its store.
   */
  fixtures?: string | undefined;
  /** CORS config (default: true) */
  cors?: boolean | { origin: string | string[] } | undefined;
  /** Enable admin API at /__admin/ (default: true) */
  admin?: boolean | undefined;
  /** Request logging (default: "normal") */
  log?: "silent" | "normal" | "verbose" | boolean | undefined;
  /** The largest JSON body the mock reads, in bytes (default: 1 MB, as a Courier server); a larger one is answered with 413 */
  maxBodyBytes?: number | undefined;
  /** The largest form or upload the mock reads, in bytes (default: 10 MB, as a Courier server); a larger one is answered with 413 */
  maxUploadBytes?: number | undefined;
  /**
   * How a write's idempotency key is honoured: one sent again gets the first
   * answer back instead of running twice; `false` runs every write.
   */
  idempotency?: IdempotencyOptions | false | undefined;
  /**
   * Keep the mock's records in the project's `.courier/mocks/`, so they
   * survive a restart of the mock — an edit that changes it included — and
   * of Studio (default: true). `false` starts it from its seeds each time.
   */
  persist?: boolean | undefined;
}

/** Seed data configuration */
export interface MockServerSeedConfig {
  /** Default records per collection (default: 20) */
  count?: number | undefined;
  /** Per-group overrides */
  [groupName: string]: { count: number } | number | undefined;
}

/** Input config for defineMockServer() — autoStart is optional */
export type MockServerConfig<TSource extends AnySource = AnySource> = Omit<
  MockServerDefinition<TSource>,
  "__type" | "autoStart"
> & {
  /** Start automatically when Studio launches (default: false) */
  autoStart?: boolean | undefined;
};

/** A mock a worker serves: the running server, its routes and how it is seeded */
export interface ServedMock {
  server: MockServer;
  routes: RouteInfo[];
  groupNames: Set<string>;
  /** The seeding the mock declares, which a reset or a count-less re-seed restores */
  seed: AutoScenarioOptions;
  /** Reports the store's changes to Studio */
  feed: StoreFeed;
  /** The whole bodies of the latest requests whose events carried a part of them */
  bodies: KeptBodies;
}

// ── IPC Protocol ─────────────────────────────────────────────────────────────

/** Messages from Studio (parent) → mock server (child) */
export type ParentMessage =
  | {
      type: "start";
      /** The project's `courier.mocks.*`, which declares the mock. */
      mocksFile: string;
      mockKey: string;
      /** The port to listen on, or to start the search for a free one from. */
      port: number;
      /**
       * Whether `port` is held exactly, as the developer named it: a taken one
       * is reported. Otherwise the mock takes the first free port from it, and
       * the bind itself decides, so two runners starting at once never share one.
       */
      strictPort: boolean;
      /** Ports given to the project's other mocks, which the search passes over. */
      avoidPorts: number[];
      /**
       * Where Studio keeps the transforms of the project's modules, for the
       * loader to read rather than transform them again; `null` when Studio
       * keeps none.
       */
      transformCacheDirectory: string | null;
      /** The file Studio keeps the mock's store in; `null` when it keeps none. */
      storeFile: string | null;
    }
  | { type: "stop" }
  | { type: "command"; command: Record<string, unknown>; requestId: string };

/** Scenario metadata sent from worker to parent on ready */
export interface ChildScenarioMeta {
  name: string;
  description?: string;
  tags?: string[];
  endpointCount: number;
  isActive: boolean;
  hasStateMachine: boolean;
  /** Why the scenario could not be read to the end; its `endpoints` are then partial. */
  introspectionError?: string;
  stateTransitions: Array<{ from: string; to: string; trigger: string }>;
  endpoints: Array<{
    group: string;
    endpoint: string;
    httpMethod: string;
    behavior: "resolves" | "returns" | "rejects" | "custom" | "sequence";
    latency?: number;
    statusCode?: number;
    sequenceLength?: number;
    stateCondition?: string;
  }>;
}

/** Messages from mock server (child) → Studio (parent) */
export type ChildMessage =
  | {
      type: "ready";
      port: number;
      url: string;
      routes: DescribedRoute[];
      collections: Array<{ name: string; count: number; records: unknown[] }>;
      scenarios: ChildScenarioMeta[];
      /**
       * The network conditions the mock starts with: the ones its definition
       * declares, or none. One that restarted keeps none set before.
       */
      network: Record<string, unknown>;
    }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "stopped" }
  | { type: "event"; event: Record<string, unknown> }
  | { type: "command-result"; requestId: string; ok: boolean; data?: unknown; error?: string };

// ── Process State ────────────────────────────────────────────────────────────

export type MockProcessStatus =
  | "declared"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "restarting";

/** Runtime state tracked by the lifecycle coordinator */
export interface MockProcessState {
  serverId: string;
  name: string;
  filePath: string;
  relativePath: string;
  configuredPort: number;
  status: MockProcessStatus;
  /** Who started the process */
  origin: "studio" | "external";
  /** Actual port (may differ from configured if conflict) */
  actualPort?: number;
  url?: string;
  pid?: number;
  startedAt?: number;
  lastError?: string;
  routeCount: number;
  collectionCount: number;
  requestsServed: number;
}
