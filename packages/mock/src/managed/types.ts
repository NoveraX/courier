import type { MockStore } from "../store";
import type { MockScenario, NetworkConfig, TypedMockFn } from "../types";

/** Configuration returned by defineMockServer() */
export interface MockServerDefinition {
  /** Marker for runtime type detection */
  __type: "nexus-mock-server";
  /** API source — enables auto-generated CRUD routes */
  source?: {
    options: {
      groups: Record<string, { options?: { prefix?: string } } & Record<string, unknown>>;
    };
  };
  /** Preferred port (0 = auto-assign, default: 0) */
  port: number;
  /** Human-readable server name (derived from source name or filename if omitted) */
  name?: string;
  /** Seed configuration */
  seed?: MockServerSeedConfig;
  /** Start automatically when Studio launches (default: false) */
  autoStart: boolean;
  /** Endpoint overrides applied after auto-generation — persist across all scenario switches */
  overrides?: (mock: TypedMockFn<any>, store: MockStore) => void;
  /** Named scenarios (happy-path is auto-generated from source) */
  scenarios?: Record<string, MockScenario>;
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

/** Input config for defineMockServer() — port and autoStart are optional */
export type MockServerConfig = Omit<MockServerDefinition, "__type" | "port" | "autoStart"> & {
  port?: number;
  /** Start automatically when Studio launches (default: true) */
  autoStart?: boolean;
};

// ── IPC Protocol ─────────────────────────────────────────────────────────────

/** Messages from Studio (parent) → mock server (child) */
export type ParentMessage =
  | { type: "start"; configPath: string; port: number }
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
      routes: Array<Record<string, unknown>>;
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
