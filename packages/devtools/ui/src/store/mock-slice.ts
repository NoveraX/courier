import { useMemo } from "react";
import { create } from "zustand";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NetworkPreset = "none" | "3g" | "flaky" | "down";
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
  errorCount: number;
  activeScenario: string | null;
  availableScenarios: string[];
  networkPreset: NetworkPreset;
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
}

export interface MockCollectionEntry {
  name: string;
  count: number;
  records: unknown[];
}

export interface MockScenarioEntry {
  name: string;
  endpointCount: number;
  isActive: boolean;
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
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface MockSliceState {
  servers: Record<string, MockServerInfo>;
  activeServerId: string | null;
  logs: MockRequestLog[];
  logsPaused: boolean;

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
}

const MAX_LOGS = 500;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useMockStore = create<MockSliceState>((set, get) => ({
  servers: {},
  activeServerId: null,
  logs: [],
  logsPaused: false,

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
