import type { AnySource } from "@noverax/courier/define";
import type { MockStore } from "../store";
import type { TypedMockFn } from "../typed-mock-fn";
import type { MockScenario, NetworkConfig } from "../types";
import type { DescribedRoute } from "./describe-route";

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
  port?: number;
  /**
   * Where to listen (default: `"localhost"`, loopback only). Use `"0.0.0.0"`
   * to reach the mock from another machine or a container — its admin API,
   * which has no authentication, is then reachable there too.
   */
  hostname?: string;
  /** Seed configuration */
  seed?: MockServerSeedConfig;
  /** Start automatically when Studio launches (default: false) */
  autoStart: boolean;
  /**
   * Endpoint overrides applied after auto-generation — persist across all
   * scenario switches. `mock` takes the source's group and endpoint names.
   */
  overrides?: (mock: TypedMockFn<NoInfer<TSource>>, store: MockStore) => void;
  /**
   * Named scenarios, each written for this source or for none (happy-path is
   * auto-generated from the source).
   */
  scenarios?: Record<string, MockScenario<NoInfer<TSource>>>;
  /** Default network simulation */
  network?: NetworkConfig;
  /** CORS config (default: true) */
  cors?: boolean | { origin: string | string[] };
  /** Enable admin API at /__admin/ (default: true) */
  admin?: boolean;
  /** Request logging (default: "normal") */
  log?: "silent" | "normal" | "verbose" | boolean;
}

/** Seed data configuration */
export interface MockServerSeedConfig {
  /** Default records per collection (default: 20) */
  count?: number;
  /** Per-group overrides */
  [groupName: string]: { count: number } | number | undefined;
}

/** Input config for defineMockServer() — autoStart is optional */
export type MockServerConfig<TSource extends AnySource = AnySource> = Omit<
  MockServerDefinition<TSource>,
  "__type" | "autoStart"
> & {
  /** Start automatically when Studio launches (default: false) */
  autoStart?: boolean;
};

// ── IPC Protocol ─────────────────────────────────────────────────────────────

/** Messages from Studio (parent) → mock server (child) */
export type ParentMessage =
  | {
      type: "start";
      /** The project's `courier.mocks.*`, which declares the mock. */
      mocksFile: string;
      mockKey: string;
      /** The port to listen on, exactly: Studio chose it, and a taken one is reported. */
      port: number;
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
