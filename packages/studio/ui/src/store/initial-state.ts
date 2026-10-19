import { loadSettings } from "./constants";
import type { StudioState } from "./store-types";

/** The store's data, before any event or action: everything but its actions. */
export type InitialState = Pick<
  StudioState,
  | "theme"
  | "studioInfo"
  | "connectionStatus"
  | "reconnectAttempt"
  | "received"
  | "bindingSnapshot"
  | "lastBindingError"
  | "requests"
  | "paused"
  | "heldRequests"
  | "shownSession"
  | "playgroundHistory"
  | "playgroundActiveResponse"
  | "connected"
  | "settings"
  | "sessionStartedAt"
  | "scanSources"
  | "registrySources"
  | "configStatus"
  | "mocksFileStatus"
  | "databaseBytes"
  | "projectWritable"
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
    received: { runtimes: false, requests: false },
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] },
    lastBindingError: null,
    requests: [],
    paused: false,
    heldRequests: [],
    shownSession: null,
    playgroundHistory: [],
    databaseBytes: null,
    projectWritable: false,
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
