import type { StudioEvent } from "./types";

/** Network simulation config (mirrors mock package, avoids cross-dependency) */
export interface MockNetworkSnapshot {
  latency?: number | string | { min: number; max: number; jitter?: number };
  errorRate?: number;
  timeout?: number;
  faultTypes?: string[];
}

// ── Mock Server Lifecycle ─────────────────────────────────────────────────────

export interface MockServerConnectEvent extends StudioEvent {
  type: "mock:server:connect";
  serverId: string;
  name: string;
  port: number;
  url: string;
  routeCount: number;
  collectionCount: number;
  recordCount: number;
  activeScenario: string | null;
}

export interface MockServerDisconnectEvent extends StudioEvent {
  type: "mock:server:disconnect";
  serverId: string;
}

export interface MockServerStatusEvent extends StudioEvent {
  type: "mock:server:status";
  serverId: string;
  uptime: number;
  routeCount: number;
  recordCount: number;
  requestsServed: number;
  errorCount: number;
  activeScenario: string | null;
}

// ── Mock Routes ───────────────────────────────────────────────────────────────

export interface MockRouteInfo {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: "auto" | "override" | "scenario";
  hits: number;
}

export interface MockRouteListEvent extends StudioEvent {
  type: "mock:route:list";
  serverId: string;
  routes: MockRouteInfo[];
}

// ── Mock Store ────────────────────────────────────────────────────────────────

export interface MockCollectionSnapshot {
  name: string;
  count: number;
  records: unknown[];
}

export interface MockStoreSnapshotEvent extends StudioEvent {
  type: "mock:store:snapshot";
  serverId: string;
  collections: MockCollectionSnapshot[];
}

export interface MockStoreChangeEvent extends StudioEvent {
  type: "mock:store:change";
  serverId: string;
  collection: string;
  operation: "create" | "update" | "delete" | "seed" | "clear";
  record?: unknown;
  count: number;
}

// ── Mock Scenarios ────────────────────────────────────────────────────────────

export interface MockScenarioInfo {
  name: string;
  endpointCount: number;
  isActive: boolean;
}

export interface MockScenarioActiveEvent extends StudioEvent {
  type: "mock:scenario:active";
  serverId: string;
  scenario: string;
  available: MockScenarioInfo[];
}

// ── Mock Network ──────────────────────────────────────────────────────────────

export interface MockNetworkConfigEvent extends StudioEvent {
  type: "mock:network:config";
  serverId: string;
  config: MockNetworkSnapshot;
}

// ── Mock Requests ─────────────────────────────────────────────────────────────

export interface MockRequestStartEvent extends StudioEvent {
  type: "mock:request:start";
  serverId: string;
  requestId: string;
  httpMethod: string;
  path: string;
  group: string;
  endpoint: string;
  variables?: unknown;
}

export interface MockRequestEndEvent extends StudioEvent {
  type: "mock:request:end";
  serverId: string;
  requestId: string;
  status: number;
  data: unknown;
  duration: number;
  latencyInjected: number;
  scenarioState: string;
}

export interface MockRequestErrorEvent extends StudioEvent {
  type: "mock:request:error";
  serverId: string;
  requestId: string;
  status: number;
  message: string;
  duration: number;
}

// ── Mock Hot Reload ───────────────────────────────────────────────────────────

export interface MockHotReloadEvent extends StudioEvent {
  type: "mock:hotreload";
  serverId: string;
  files: string[];
  routesChanged: number;
}
