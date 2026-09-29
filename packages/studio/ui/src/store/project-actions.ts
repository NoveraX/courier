import type { StudioSet } from "./store-access";
import type { StudioState } from "./store-types";

type ProjectActions = Pick<
  StudioState,
  | "setScanSources"
  | "setRegistrySources"
  | "setConfigStatus"
  | "setMocksFileStatus"
  | "setWatcherStatus"
  | "setWatcherChange"
>;

/**
 * The Studio store's actions for what Studio tells of the project it runs,
 * pushed over the socket: the sources scanned and registered, how the
 * config and the mocks file load, and the file watcher.
 *
 * @param set - The store's `set`
 * @returns The actions
 *
 * @example
 * ```ts
 * create<StudioState>((set, get) => ({ ...createProjectActions(set), ... }));
 * ```
 */
export function createProjectActions(set: StudioSet): ProjectActions {
  return {
    setScanSources: (sources) => set({ scanSources: sources }),
    setRegistrySources: (sources) => set({ registrySources: sources }),
    setConfigStatus: (status) => set({ configStatus: status }),
    setMocksFileStatus: (status) => set({ mocksFileStatus: status }),
    setWatcherStatus: (apiPaths) => set({ watcherApiPaths: apiPaths }),
    setWatcherChange: (change) => set({ watcherLastChange: change }),
  };
}
