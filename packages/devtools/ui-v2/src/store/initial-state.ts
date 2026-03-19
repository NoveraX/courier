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
    explorerSelectedEndpoint: null as DevToolsState["explorerSelectedEndpoint"],
    graphLayout: "LR" as const,
    showSchemas: true,
    listSearch: "",
    listSortKey: "source" as const,
    listSortDir: "asc" as const,
    waterfallSortBy: "startTime" as const,
    waterfallGroupBy: "none" as const,
    waterfallZoom: 1,
    middlewareShowStats: false,
    comparePickerSide: null as DevToolsState["comparePickerSide"],
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
