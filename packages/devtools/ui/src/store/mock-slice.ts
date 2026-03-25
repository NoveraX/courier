import { useMemo } from "react";
import { create } from "zustand";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NetworkPreset = "none" | "3g" | "4g" | "satellite" | "flaky" | "down";
export type LatencyPreset = "none" | "3g" | "4g" | "satellite" | "custom";
export type ChaosPreset = "none" | "degraded" | "unstable" | "down" | "custom";
export type LatencyDistribution = "uniform" | "normal" | "log-normal";
export type ProcessStatus = "declared" | "starting" | "running" | "stopping" | "stopped" | "crashed" | "restarting";

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
  origin: "devtools" | "external";
  filePath?: string;
  lastError?: string;
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

export interface FaultWeight {
  type: string;
  /** 0–100, weights are normalized to sum to 100 across enabled faults */
  weight: number;
}

export interface StopCondition {
  enabled: boolean;
  /** Auto-halt when error rate exceeds this % for errorRateDurationSecs */
  errorRateThreshold: number;
  errorRateDurationSecs: number;
  /** Auto-halt when P99 exceeds this ms for p99DurationSecs */
  p99Threshold: number;
  p99DurationSecs: number;
  /** Hard cap on experiment duration in minutes; 0 = unlimited */
  maxDurationMins: number;
}

export interface NetworkConfig {
  latency: number | { min: number; max: number; jitter?: number; distribution?: LatencyDistribution };
  errorRate: number;
  faultWeights?: FaultWeight[];
  /** Bandwidth cap in Kbps; 0 = unlimited */
  bandwidth?: number;
  stopConditions?: StopCondition;
  routeOverrides?: RouteOverride[];
}

export interface RouteOverride {
  /** "group:endpoint" key */
  routeId: string;
  enabled: boolean;
  latency?: { min: number; max: number; jitter: number };
  errorRate?: number;
  faultTypes?: string[];
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: number;
  chaosMode: string;
  networkConfig: NetworkConfig;
  networkPreset: NetworkPreset;
}

export interface ExperimentEvent {
  id: string;
  serverId: string;
  timestamp: number;
  type: "started" | "stopped" | "auto-halted";
  mode: string;
  errorRate: number;
  peakErrorRate?: number;
  peakP99?: number;
  durationMs?: number;
  reason?: string;
}

export interface MockRequestLog {
  id: string;
  serverId: string;
  timestamp: number;
  httpMethod: string;
  path: string;
  group: string;
  endpoint: string;
  status?: number;
  duration?: number;
  error?: string;
  variables?: unknown;
  data?: unknown;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface MockSliceState {
  servers: Record<string, MockServerInfo>;
  activeServerId: string | null;
  logs: MockRequestLog[];
  logsPaused: boolean;
  experimentHistory: ExperimentEvent[];

  // Actions
  addServer: (server: MockServerInfo) => void;
  removeServer: (serverId: string) => void;
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

const MAX_LOGS = 500;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useMockStore = create<MockSliceState>((set, get) => ({
  servers: {},
  activeServerId: null,
  logs: [],
  logsPaused: false,
  experimentHistory: [],

  addServer(server) {
    set((state) => {
      const servers = { ...state.servers, [server.serverId]: server };
      const activeServerId = state.activeServerId ?? server.serverId;
      return { servers, activeServerId };
    });
  },

  removeServer(serverId) {
    set((state) => {
      const { [serverId]: _, ...servers } = state.servers;
      const keys = Object.keys(servers);
      const activeServerId = state.activeServerId === serverId
        ? (keys[0] ?? null)
        : state.activeServerId;
      return { servers, activeServerId };
    });
  },

  updateServer(serverId, patch) {
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return state;
      return {
        servers: { ...state.servers, [serverId]: { ...existing, ...patch } },
      };
    });
  },

  selectServer(serverId) {
    set({ activeServerId: serverId });
  },

  setServerCollections(serverId, collections) {
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return state;
      return {
        servers: { ...state.servers, [serverId]: { ...existing, collections } },
      };
    });
  },

  setServerRoutes(serverId, routes) {
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return state;
      return {
        servers: { ...state.servers, [serverId]: { ...existing, routes } },
      };
    });
  },

  setServerScenarios(serverId, scenarios) {
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return state;
      return {
        servers: { ...state.servers, [serverId]: { ...existing, scenarios } },
      };
    });
  },

  addLog(log) {
    if (get().logsPaused) return;
    set((state) => ({
      logs: [log, ...state.logs].slice(0, MAX_LOGS),
    }));
  },

  clearLogs() {
    set({ logs: [] });
  },

  toggleLogsPaused() {
    set((state) => ({ logsPaused: !state.logsPaused }));
  },

  resetMockState() {
    set({
      servers: {},
      activeServerId: null,
      logs: [],
      logsPaused: false,
      experimentHistory: [],
    });
  },

  addExperimentEvent(event) {
    set((state) => ({
      experimentHistory: [event, ...state.experimentHistory].slice(0, 100),
    }));
  },

  saveScenario(serverId, scenario) {
    set((state) => {
      const server = state.servers[serverId];
      if (!server) return state;
      const savedScenarios = [...(server.savedScenarios ?? []).filter((s) => s.id !== scenario.id), scenario];
      return { servers: { ...state.servers, [serverId]: { ...server, savedScenarios } } };
    });
  },

  deleteScenario(serverId, scenarioId) {
    set((state) => {
      const server = state.servers[serverId];
      if (!server) return state;
      const savedScenarios = (server.savedScenarios ?? []).filter((s) => s.id !== scenarioId);
      return { servers: { ...state.servers, [serverId]: { ...server, savedScenarios } } };
    });
  },

  setRouteOverride(serverId, override) {
    set((state) => {
      const server = state.servers[serverId];
      if (!server) return state;
      const routeOverrides = [
        ...(server.routeOverrides ?? []).filter((r) => r.routeId !== override.routeId),
        override,
      ];
      return { servers: { ...state.servers, [serverId]: { ...server, routeOverrides } } };
    });
  },

  clearRouteOverrides(serverId) {
    set((state) => {
      const server = state.servers[serverId];
      if (!server) return state;
      return { servers: { ...state.servers, [serverId]: { ...server, routeOverrides: [] } } };
    });
  },
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useActiveServer(): MockServerInfo | undefined {
  const activeServerId = useMockStore((s) => s.activeServerId);
  const servers = useMockStore((s) => s.servers);
  return activeServerId ? servers[activeServerId] : undefined;
}

export function useServerCount(): number {
  return useMockStore((s) => Object.keys(s.servers).length);
}

export function useAllServers(): MockServerInfo[] {
  const servers = useMockStore((s) => s.servers);
  return useMemo(() => Object.values(servers), [servers]);
}
