import type { StudioState } from "./store-types"
import { loadSettings, loadSessionStartedAt } from "./constants"

// ── Initial State Factory ───────────────────────────────────────────────────

export function createInitialState(savedTheme: StudioState["theme"]) {
  return {
    theme: savedTheme,
    connectionStatus: "disconnected" as const,
    reconnectAttempt: 0,
    bindingSnapshot: { rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] } as StudioState["bindingSnapshot"],
    lastBindingError: null as StudioState["lastBindingError"],
    requests: [] as StudioState["requests"],
    paused: false,
    shownSession: null as StudioState["shownSession"],
    auditExpandedIds: new Set<string>(),
    playgroundHistory: [] as StudioState["playgroundHistory"],
    playgroundActiveResponse: null as StudioState["playgroundActiveResponse"],
    connected: false,
    settings: loadSettings(),
    sessionStartedAt: loadSessionStartedAt(),
    scanSources: [] as StudioState["scanSources"],
    registrySources: [] as StudioState["registrySources"],
    configStatus: null,
    mocksFileStatus: null,
    clientTick: 0,
    droppedRequests: 0,
    watcherApiPaths: 0,
    watcherMockFiles: 0,
    watcherLastChange: null,
  }
}
