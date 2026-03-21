import type { MockServer } from "../server/create-mock-server";

/** Route entry sent to DevTools UI */
export interface MockRouteInfo {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: "auto" | "override" | "scenario";
  hits: number;
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
  /** Available scenario names */
  scenarios?: string[];
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
  routeCount: number;
  routes: MockRouteInfo[];
  activeScenario: string;
  availableScenarios: string[];
}

// ── Commands (UI → Mock Server) ───────────────────────────────────────────────

export type MockCommand =
  | MockStoreCreateCommand
  | MockStoreUpdateCommand
  | MockStoreDeleteCommand
  | MockStoreSeedCommand
  | MockScenarioApplyCommand
  | MockNetworkSetCommand
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
    latency?: number | string | { min: number; max: number; jitter?: number };
    errorRate?: number;
    timeout?: number;
    faultTypes?: string[];
  };
}

export interface MockServerResetCommand {
  action: "mock:server:reset";
  serverId: string;
}
