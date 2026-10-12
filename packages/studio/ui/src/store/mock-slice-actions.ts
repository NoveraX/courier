/**
 * Action implementations for the mock Zustand slice.
 *
 * Exposes a single `createMockSliceActions(set, get)` factory that the
 * store calls during initialization — the public store API
 * (`useMockStore`) lives in `mock-slice.ts`.
 */

import type { StoreApi } from "zustand";
import { mockServerOf } from "./mock-server-of";
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

    /* On each (re)connect: Studio sends the mocks it runs, so one it no
       longer runs would otherwise stay listed for good. */
    forgetManagedServers() {
      set((state) => {
        const kept = Object.values(state.servers).filter((server) => !server.managed);
        const servers = Object.fromEntries(kept.map((server) => [server.serverId, server]));
        const activeServerId =
          state.activeServerId !== null && state.activeServerId in servers
            ? state.activeServerId
            : (kept[0]?.serverId ?? null);
        return { servers, activeServerId };
      });
    },

    updateServer(serverId: string, patch: Partial<MockServerInfo>) {
      set((state) => patchServer(state, serverId, patch));
    },

    selectServer(serverId: string | null) {
      set({ activeServerId: serverId });
    },

    setServerCollections(
      serverId: string,
      collections: MockCollectionEntry[],
      storeSeq: number,
      recordsLoaded: boolean,
    ) {
      /* The dashboard's counts follow the store as it was last reported. */
      const recordCount = collections.reduce((sum, collection) => sum + collection.count, 0);
      set((state) =>
        patchServer(state, serverId, {
          collections,
          recordsLoaded,
          ...(recordsLoaded ? { recordsProblem: undefined } : {}),
          storeSeq,
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

    clearServerLogs(serverId: string) {
      set((state) => ({ logs: state.logs.filter((log) => log.serverId !== serverId) }));
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
  };
}
