/**
 * Action implementations for the mock Zustand slice.
 *
 * Exposes a single `createMockSliceActions(set, get)` factory that the
 * store calls during initialization — the public store API
 * (`useMockStore`) lives in `mock-slice.ts`.
 */

import type { StoreApi } from "zustand";
import { mockServerOf } from "./mock-server-of";
import type { RouteOverride, SavedScenario } from "./mock-slice-network-types";
import type {
  MockCollectionEntry,
  MockRequestLog,
  MockRouteEntry,
  MockScenarioEntry,
  MockServerInfo,
  MockSliceState,
} from "./mock-slice-types";

const MAX_LOGS = 500;
const MAX_EXPERIMENT_HISTORY = 100;

type Setter = StoreApi<MockSliceState>["setState"];
type Getter = StoreApi<MockSliceState>["getState"];

/** Every action of the slice: all it holds but its data. */
type MockActions = Omit<
  MockSliceState,
  "servers" | "activeServerId" | "logs" | "logsPaused" | "experimentHistory"
>;

export function createMockSliceActions(set: Setter, get: Getter): MockActions {
  /* A patch derived from the server as it is now, or none when no such server is listed. */
  const patchServer = (
    state: MockSliceState,
    serverId: string,
    patch: Partial<MockServerInfo> | ((server: MockServerInfo) => Partial<MockServerInfo>),
  ): Partial<MockSliceState> => {
    const existing = mockServerOf(state.servers, serverId);
    if (!existing) return state;
    const changes = typeof patch === "function" ? patch(existing) : patch;
    return { servers: { ...state.servers, [serverId]: { ...existing, ...changes } } };
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
      /* The dashboard's counts follow the store as it was last sent. */
      const recordCount = collections.reduce((sum, collection) => sum + collection.count, 0);
      set((state) =>
        patchServer(state, serverId, {
          collections,
          collectionCount: collections.length,
          recordCount,
        }),
      );
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
      set((state) =>
        patchServer(state, serverId, (server) => ({
          savedScenarios: [
            ...(server.savedScenarios ?? []).filter((s) => s.id !== scenario.id),
            scenario,
          ],
        })),
      );
    },

    deleteScenario(serverId: string, scenarioId: string) {
      set((state) =>
        patchServer(state, serverId, (server) => ({
          savedScenarios: (server.savedScenarios ?? []).filter((s) => s.id !== scenarioId),
        })),
      );
    },

    setRouteOverride(serverId: string, override: RouteOverride) {
      set((state) =>
        patchServer(state, serverId, (server) => ({
          routeOverrides: [
            ...(server.routeOverrides ?? []).filter((r) => r.routeId !== override.routeId),
            override,
          ],
        })),
      );
    },

    clearRouteOverrides(serverId: string) {
      set((state) => patchServer(state, serverId, { routeOverrides: [] }));
    },
  };
}
