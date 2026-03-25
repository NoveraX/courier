import type { RouteInfo } from "../auto/route-analyzer";
import type { MockServer } from "../server/create-mock-server";
import type { MockScenario } from "../types";

/** Route entry sent to DevTools UI */
export interface MockRouteInfo {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: "auto" | "override" | "scenario";
  hits: number;
  /** Serialized response schema shape (field → type) for Schema tab */
  responseSchema?: Record<string, string>;
  /** Auto-generated example response for Example tab */
  exampleResponse?: unknown;
}

/** Options for connecting a mock server to DevTools */
export interface MockDevToolsBridgeOptions {
  /** DevTools server host (default: "localhost") */
  host?: string;
  /** DevTools server port (default: 4380) */
  port?: number;
  /** Human-readable server name (default: "Mock Server :${port}") */
  name?: string;
  /** Mock server port (for display in DevTools UI) */
  serverPort?: number;
  /** Mock server URL (for display in DevTools UI) */
  serverUrl?: string;
  /** Number of registered routes */
  routeCount?: number;
  /** Route info for DevTools Routes tab */
  routes?: MockRouteInfo[];
  /** Full analyzed routes with schemas — for schema-aware re-seeding */
  analyzedRoutes?: RouteInfo[];
  /** Available scenario names */
  scenarios?: string[];
  /** Full scenario objects for endpoint introspection */
  scenarioMap?: Record<string, MockScenario>;
  /** Re-seed all collections after a store reset — provided by createAutoMockServer */
  reseed?: () => void;
}

/** Active bridge connection — call disconnect() to tear down */
export interface MockDevToolsBridge {
  /** Unique server identifier */
  serverId: string;
  /** Disconnect from DevTools and stop all emitting */
  disconnect(): void;
}

/** Internal context passed between bridge modules */
export interface BridgeContext {
  server: MockServer;
  serverId: string;
  sessionId: string;
  name: string;
  port: number;
  url: string;
  startedAt: number;
  requestCounter: number;
  /** Requests served since the current scenario was activated — reset on each scenario change */
  scenarioRequestCount: number;
  routeCount: number;
  routes: MockRouteInfo[];
  /** Full route info with schemas — used for schema-aware re-seeding */
  analyzedRoutes: RouteInfo[];
  activeScenario: string;
  availableScenarios: string[];
  /** Full scenario objects for endpoint introspection — may be empty for external servers */
  scenarioMap: Record<string, MockScenario>;
  /** Re-seed all collections after a store reset — provided by createAutoMockServer */
  reseed?: () => void;
}

// ── Commands (UI → Mock Server) ───────────────────────────────────────────────

export type MockCommand =
  | MockStoreCreateCommand
  | MockStoreUpdateCommand
  | MockStoreDeleteCommand
  | MockStoreSeedCommand
  | MockScenarioApplyCommand
  | MockNetworkSetCommand
  | MockChaosSetCommand
  | MockServerResetCommand;

export interface MockStoreCreateCommand {
  action: "mock:store:create";
  serverId: string;
  collection: string;
  record: Record<string, unknown>;
}

export interface MockStoreUpdateCommand {
  action: "mock:store:update";
  serverId: string;
  collection: string;
  id: string | number;
  data: Record<string, unknown>;
}

export interface MockStoreDeleteCommand {
  action: "mock:store:delete";
  serverId: string;
  collection: string;
  id: string | number;
}

export interface MockStoreSeedCommand {
  action: "mock:store:seed";
  serverId: string;
  collection: string;
  count: number;
}

export interface MockScenarioApplyCommand {
  action: "mock:scenario:apply";
  serverId: string;
  scenario: string;
}

export interface MockNetworkSetCommand {
  action: "mock:network:set";
  serverId: string;
  config: {
    latency?:
      | number
      | string
      | { min: number; max: number; jitter?: number; distribution?: string };
    errorRate?: number;
    timeout?: number;
    bandwidth?: number;
    faultTypes?: string[];
    faultWeights?: Array<{ type: string; weight: number }>;
    routeOverrides?: Array<{
      routeId: string;
      enabled: boolean;
      latency?: { min: number; max: number; jitter?: number };
      errorRate?: number;
      faultTypes?: string[];
    }>;
    stopConditions?: {
      enabled: boolean;
      errorRateThreshold: number;
      errorRateDurationSecs: number;
      p99Threshold: number;
      p99DurationSecs: number;
      maxDurationMins: number;
    };
  };
  preset?: string;
}

export interface MockChaosSetCommand {
  action: "mock:chaos:set";
  serverId: string;
  config: {
    errorRate?: number;
    faultWeights?: Array<{ type: string; weight: number }>;
    stopConditions?: {
      enabled: boolean;
      errorRateThreshold: number;
      errorRateDurationSecs: number;
      p99Threshold: number;
      p99DurationSecs: number;
      maxDurationMins: number;
    };
  };
  preset?: string;
}

export interface MockServerResetCommand {
  action: "mock:server:reset";
  serverId: string;
}
