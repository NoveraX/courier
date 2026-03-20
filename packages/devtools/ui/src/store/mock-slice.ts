import { create } from "zustand";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MockServerInfo {
  serverId: string;
  name: string;
  port: number;
  url: string;
  status: "connected" | "disconnected";
  uptime: number;
  routeCount: number;
  collectionCount: number;
  recordCount: number;
  requestsServed: number;
  errorCount: number;
  activeScenario: string | null;
  lastHeartbeat: number;
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
  servers: Map<string, MockServerInfo>;
  activeServerId: string | null;
  routes: MockRouteEntry[];
  collections: MockCollectionEntry[];
  scenarios: MockScenarioEntry[];
  logs: MockRequestLog[];
  logsPaused: boolean;

  // Actions
  addServer: (server: MockServerInfo) => void;
  removeServer: (serverId: string) => void;
  updateServer: (serverId: string, patch: Partial<MockServerInfo>) => void;
  selectServer: (serverId: string | null) => void;
  setRoutes: (routes: MockRouteEntry[]) => void;
  setCollections: (collections: MockCollectionEntry[]) => void;
  setScenarios: (scenarios: MockScenarioEntry[]) => void;
  addLog: (log: MockRequestLog) => void;
  clearLogs: () => void;
  toggleLogsPaused: () => void;
  resetMockState: () => void;
}

const MAX_LOGS = 500;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useMockStore = create<MockSliceState>((set, get) => ({
  servers: new Map(),
  activeServerId: null,
  routes: [],
  collections: [],
  scenarios: [],
  logs: [],
  logsPaused: false,

  addServer(server) {
    set((state) => {
      const servers = new Map(state.servers);
      servers.set(server.serverId, server);
      // Auto-select first server
      const activeServerId = state.activeServerId ?? server.serverId;
      return { servers, activeServerId };
    });
  },

  removeServer(serverId) {
    set((state) => {
      const servers = new Map(state.servers);
      servers.delete(serverId);
      const activeServerId = state.activeServerId === serverId
        ? (servers.keys().next().value ?? null)
        : state.activeServerId;
      return { servers, activeServerId };
    });
  },

  updateServer(serverId, patch) {
    set((state) => {
      const servers = new Map(state.servers);
      const existing = servers.get(serverId);
      if (existing) {
        servers.set(serverId, { ...existing, ...patch });
      }
      return { servers };
    });
  },

  selectServer(serverId) {
    set({ activeServerId: serverId });
  },

  setRoutes(routes) {
    set({ routes });
  },

  setCollections(collections) {
    set({ collections });
  },

  setScenarios(scenarios) {
    set({ scenarios });
  },

  addLog(log) {
    if (get().logsPaused) return;
    set((state) => {
      const logs = [log, ...state.logs].slice(0, MAX_LOGS);
      return { logs };
    });
  },

  clearLogs() {
    set({ logs: [] });
  },

  toggleLogsPaused() {
    set((state) => ({ logsPaused: !state.logsPaused }));
  },

  resetMockState() {
    set({
      servers: new Map(),
      activeServerId: null,
      routes: [],
      collections: [],
      scenarios: [],
      logs: [],
      logsPaused: false,
    });
  },
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useActiveServer(): MockServerInfo | undefined {
  return useMockStore((s) => {
    if (!s.activeServerId) return undefined;
    return s.servers.get(s.activeServerId);
  });
}

export function useServerCount(): number {
  return useMockStore((s) => s.servers.size);
}

export function useAllServers(): MockServerInfo[] {
  return useMockStore((s) => [...s.servers.values()]);
}
