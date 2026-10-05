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

/** A collection of a mock's store, whole: its name, how many records it holds, and the records. */
export interface MockCollectionSnapshot {
  name: string;
  count: number;
  records: unknown[];
}

/** The edits that turn a collection as last reported into the collection as it is now. */
export interface MockCollectionEdits {
  /** The indexes, in the collection as last reported, of the records gone. */
  removed: number[];
  /** The records changed in place, each at its index once the removed are gone. */
  changed: Array<{ index: number; record: unknown }>;
  /** The records added after all the others. */
  added: unknown[];
}

/** A collection that changed: whole, or as the edits to the one last reported. */
export type MockCollectionReport =
  | MockCollectionSnapshot
  | { name: string; count: number; edits: MockCollectionEdits };

/**
 * What changed in a mock's store since it last reported. Reports are
 * numbered, so whoever holds the store sees one it missed, and asks for the
 * store whole instead of applying edits to records it does not have.
 */
export interface MockStoreReport {
  /** One more than the report before; the store the mock started with is report 0. */
  seq: number;
  /** Whether it holds every collection whole, as a resend does: then no collection it leaves out remains. */
  whole: boolean;
  /** Each collection that changed. */
  collections: MockCollectionReport[];
  /** The names of the collections gone. */
  removed: string[];
}

export interface MockStoreChangesEvent extends StudioEvent, MockStoreReport {
  type: "mock:store:changes";
  serverId: string;
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
