import { loadSettings } from "./constants";
import type { StudioState } from "./store-types";

/** The store's data, before any event or action: everything but its actions. */
export type InitialState = Pick<
  StudioState,
  | "theme"
  | "studioInfo"
  | "connectionStatus"
  | "reconnectAttempt"
  | "bindingSnapshot"
  | "lastBindingError"
  | "requests"
  | "paused"
  | "heldRequests"
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
  | "watcherSince"
  | "watcherLastChange"
>;

export function createInitialState(savedTheme: StudioState["theme"]): InitialState {
  return {
    theme: savedTheme,
    studioInfo: null,
    connectionStatus: "connecting",
    reconnectAttempt: 0,
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] },
    lastBindingError: null,
    requests: [],
    paused: false,
    heldRequests: [],
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
    watcherSince: null,
    watcherLastChange: null,
  };
}
