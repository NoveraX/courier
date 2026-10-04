import { loadSettings } from "./constants";
import type { StudioState } from "./store-types";

/** The store's data, before any event or action: everything but its actions. */
export type InitialState = Pick<
  StudioState,
  | "theme"
  | "connectionStatus"
  | "reconnectAttempt"
  | "bindingSnapshot"
  | "lastBindingError"
  | "requests"
  | "paused"
  | "shownSession"
  | "auditExpandedIds"
  | "playgroundHistory"
  | "playgroundActiveResponse"
  | "connected"
  | "settings"
  | "sessionStartedAt"
  | "scanSources"
  | "registrySources"
  | "configStatus"
  | "mocksFileStatus"
  | "clientTick"
  | "droppedRequests"
  | "watcherApiPaths"
  | "watcherLastChange"
>;

export function createInitialState(savedTheme: StudioState["theme"]): InitialState {
  return {
    theme: savedTheme,
    connectionStatus: "disconnected",
    reconnectAttempt: 0,
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] },
    lastBindingError: null,
    requests: [],
    paused: false,
    shownSession: null,
    auditExpandedIds: new Set<string>(),
    playgroundHistory: [],
    playgroundActiveResponse: null,
    connected: false,
    settings: loadSettings(),
    sessionStartedAt: null,
    scanSources: [],
    registrySources: [],
    configStatus: null,
    mocksFileStatus: null,
    clientTick: 0,
    droppedRequests: 0,
    watcherApiPaths: 0,
    watcherLastChange: null,
  };
}
