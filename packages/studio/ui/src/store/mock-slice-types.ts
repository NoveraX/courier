/**
 * Core data shapes for the mock Zustand slice — server runtime types.
 *
 * Holds the everyday types consumed across the dashboard, routes, logs and
 * scenario views (`MockServerInfo`, `MockRouteEntry`, `MockCollectionEntry`,
 * `MockScenarioEntry`, `MockRequestLog`). Network/chaos/experiment shapes
 * live in `mock-slice-network-types.ts`. Both modules are re-exported by
 * `mock-slice.ts`, so consumers continue to import from there.
 */

import type {
  ChaosPreset,
  ExperimentEvent,
  LatencyPreset,
  NetworkConfig,
  NetworkPreset,
  RouteOverride,
  SavedScenario,
  StopCondition,
} from "./mock-slice-network-types";

export type ProcessStatus =
  | "declared"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "restarting";

export interface MockServerInfo {
  serverId: string;
  name: string;
  port: number;
  url: string;
  status: "connected" | "disconnected";
  /** Server start timestamp — uptime computed on client as Date.now() - startedAt */
  startedAt: number;
  routeCount: number;
  collectionCount: number;
  recordCount: number;
  requestsServed: number;
  /** Requests served since the current scenario was last activated */
  scenarioRequestCount: number;
  errorCount: number;
  activeScenario: string | null;
  availableScenarios: string[];
  networkPreset: NetworkPreset;
  networkConfig: NetworkConfig | null;
  /** UTC ms when current fault session was started; null when stable */
  faultStartedAt?: number | null;
  /** Independent latency state */
  latencyPreset: LatencyPreset;
  latencyStartedAt?: number | null;
  /** Independent chaos state */
  chaosPreset: ChaosPreset;
  chaosStartedAt?: number | null;
  stopConditions?: StopCondition;
  routeOverrides?: RouteOverride[];
  savedScenarios?: SavedScenario[];
  /** Managed lifecycle */
  managed: boolean;
  processStatus: ProcessStatus;
  origin: "studio" | "external";
  filePath?: string | undefined;
  lastError?: string | undefined;
  /** Per-server data */
  collections: MockCollectionEntry[];
  routes: MockRouteEntry[];
  scenarios: MockScenarioEntry[];
}

export interface MockRouteEntry {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: "auto" | "override" | "scenario";
  hits: number;
  /** Running average latency in ms — computed from request logs */
  avgLatency: number;
  /** Serialized response schema shape (field → type) for Schema tab */
  responseSchema?: Record<string, string>;
  /** Auto-generated example response for Example tab */
  exampleResponse?: unknown;
}

export interface MockCollectionEntry {
  name: string;
  count: number;
  records: unknown[];
}

export interface MockScenarioEndpoint {
  /** Null for top-level endpoints (not inside a group) */
  group: string | null;
  endpoint: string;
  httpMethod: string;
  behavior: "resolves" | "returns" | "rejects" | "custom" | "sequence";
  latency?: number;
  statusCode?: number;
  sequenceLength?: number;
  stateCondition?: string;
}

export interface StateTransition {
  from: string;
  to: string;
  trigger: string;
}

export interface MockScenarioEntry {
  name: string;
  description?: string;
  tags?: string[];
  endpointCount: number;
  isActive: boolean;
  hasStateMachine: boolean;
  stateTransitions: StateTransition[];
  endpoints: MockScenarioEndpoint[];
}

export interface MockRequestLog {
  id: string;
  serverId: string;
  timestamp: number;
  httpMethod: string;
  path: string;
  group: string;
  endpoint: string;
  status?: number | undefined;
  duration?: number | undefined;
  error?: string | undefined;
  variables?: unknown;
  data?: unknown;
  requestHeaders?: Record<string, string> | undefined;
  responseHeaders?: Record<string, string> | undefined;
}

export interface MockSliceState {
  servers: Record<string, MockServerInfo>;
  activeServerId: string | null;
  logs: MockRequestLog[];
  logsPaused: boolean;
  experimentHistory: ExperimentEvent[];

  // Actions
  addServer: (server: MockServerInfo) => void;
  removeServer: (serverId: string) => void;
  /** Drop every mock Studio runs, before Studio sends them again on connecting. */
  forgetManagedServers: () => void;
  updateServer: (serverId: string, patch: Partial<MockServerInfo>) => void;
  selectServer: (serverId: string | null) => void;
  setServerCollections: (serverId: string, collections: MockCollectionEntry[]) => void;
  setServerRoutes: (serverId: string, routes: MockRouteEntry[]) => void;
  setServerScenarios: (serverId: string, scenarios: MockScenarioEntry[]) => void;
  addLog: (log: MockRequestLog) => void;
  clearLogs: () => void;
  toggleLogsPaused: () => void;
  resetMockState: () => void;
  addExperimentEvent: (event: ExperimentEvent) => void;
  saveScenario: (serverId: string, scenario: SavedScenario) => void;
  deleteScenario: (serverId: string, scenarioId: string) => void;
  setRouteOverride: (serverId: string, override: RouteOverride) => void;
  clearRouteOverrides: (serverId: string) => void;
}
