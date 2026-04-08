/**
 * Action implementations for the mock Zustand slice.
 *
 * Exposes a single `createMockSliceActions(set, get)` factory that the
 * store calls during initialization — the public store API
 * (`useMockStore`) lives in `mock-slice.ts`.
 */

import type { StoreApi } from "zustand";

import type {
  MockCollectionEntry,
  MockRequestLog,
  MockRouteEntry,
  MockScenarioEntry,
  MockServerInfo,
  MockSliceState,
} from "./mock-slice-types";
import type { RouteOverride, SavedScenario } from "./mock-slice-network-types";

const MAX_LOGS = 500;
const MAX_EXPERIMENT_HISTORY = 100;

type Setter = StoreApi<MockSliceState>["setState"];
type Getter = StoreApi<MockSliceState>["getState"];

type MockActions = Pick<
  MockSliceState,
  | "addServer"
  | "removeServer"
  | "updateServer"
  | "selectServer"
  | "setServerCollections"
  | "setServerRoutes"
  | "setServerScenarios"
  | "addLog"
  | "clearLogs"
  | "toggleLogsPaused"
  | "resetMockState"
  | "addExperimentEvent"
  | "saveScenario"
  | "deleteScenario"
  | "setRouteOverride"
  | "clearRouteOverrides"
>;

export function createMockSliceActions(set: Setter, get: Getter): MockActions {
  const patchServer = (
    state: MockSliceState,
    serverId: string,
    patch: Partial<MockServerInfo>,
  ): Partial<MockSliceState> => {
    const existing = state.servers[serverId];
    if (!existing) return state;
    return {
      servers: { ...state.servers, [serverId]: { ...existing, ...patch } },
    };
  };

  return {
    addServer(server: MockServerInfo) {
      set((state) => {
        const servers = { ...state.servers, [server.serverId]: server };
        const activeServerId = state.activeServerId ?? server.serverId;
        return { servers, activeServerId };
      });
    },

    removeServer(serverId: string) {
      set((state) => {
        const { [serverId]: _, ...servers } = state.servers;
        const keys = Object.keys(servers);
        const activeServerId =
          state.activeServerId === serverId ? (keys[0] ?? null) : state.activeServerId;
        return { servers, activeServerId };
      });
    },

    updateServer(serverId: string, patch: Partial<MockServerInfo>) {
      set((state) => patchServer(state, serverId, patch));
    },

    selectServer(serverId: string | null) {
      set({ activeServerId: serverId });
    },

    setServerCollections(serverId: string, collections: MockCollectionEntry[]) {
      set((state) => patchServer(state, serverId, { collections }));
    },

    setServerRoutes(serverId: string, routes: MockRouteEntry[]) {
      set((state) => patchServer(state, serverId, { routes }));
    },

    setServerScenarios(serverId: string, scenarios: MockScenarioEntry[]) {
      set((state) => patchServer(state, serverId, { scenarios }));
    },

    addLog(log: MockRequestLog) {
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
        experimentHistory: [event, ...state.experimentHistory].slice(0, MAX_EXPERIMENT_HISTORY),
      }));
    },

    saveScenario(serverId: string, scenario: SavedScenario) {
      set((state) => {
        const server = state.servers[serverId];
        if (!server) return state;
        const savedScenarios = [
          ...(server.savedScenarios ?? []).filter((s) => s.id !== scenario.id),
          scenario,
        ];
        return patchServer(state, serverId, { savedScenarios });
      });
    },

    deleteScenario(serverId: string, scenarioId: string) {
      set((state) => {
        const server = state.servers[serverId];
        if (!server) return state;
        const savedScenarios = (server.savedScenarios ?? []).filter((s) => s.id !== scenarioId);
        return patchServer(state, serverId, { savedScenarios });
      });
    },

    setRouteOverride(serverId: string, override: RouteOverride) {
      set((state) => {
        const server = state.servers[serverId];
        if (!server) return state;
        const routeOverrides = [
          ...(server.routeOverrides ?? []).filter((r) => r.routeId !== override.routeId),
          override,
        ];
        return patchServer(state, serverId, { routeOverrides });
      });
    },

    clearRouteOverrides(serverId: string) {
      set((state) => patchServer(state, serverId, { routeOverrides: [] }));
    },
  };
}
