import type { DevToolsState } from "./store-types"
import { loadSettings, loadSessionStartedAt } from "./constants"

// ── Initial State Factory ───────────────────────────────────────────────────

export function createInitialState(savedTheme: DevToolsState["theme"]) {
  return {
    theme: savedTheme,
    connectionStatus: "disconnected" as const,
    reconnectAttempt: 0,
    sessions: [] as DevToolsState["sessions"],
    catalog: {} as DevToolsState["catalog"],
    requests: [] as DevToolsState["requests"],
    paused: false,
    auditExpandedIds: new Set<string>(),
    playgroundHistory: [] as DevToolsState["playgroundHistory"],
    playgroundActiveResponse: null as DevToolsState["playgroundActiveResponse"],
    connected: false,
    settings: loadSettings(),
    sessionStartedAt: loadSessionStartedAt(),
    relativeTick: 0,
    droppedRequests: 0,
  }
}
