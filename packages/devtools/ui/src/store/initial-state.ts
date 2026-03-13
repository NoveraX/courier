import type { DevToolsState } from "./store-types"
import { loadSettings, loadSessionStartedAt } from "./constants"

// ── Initial State Factory ───────────────────────────────────────────────────

export function createInitialState(
  savedTheme: DevToolsState["theme"],
) {
  return {
    theme: savedTheme,
    toasts: [] as DevToolsState["toasts"],
    connectionStatus: "disconnected" as const,
    reconnectAttempt: 0,
    sessions: [] as DevToolsState["sessions"],
    requests: [] as DevToolsState["requests"],
    selectedRequestId: null as string | null,
    paused: false,
    preserveLog: false,
    timelineFilters: {
      search: "", status: [], mode: [], type: [],
      httpMethod: [], source: [], group: [], minDuration: null,
    } as DevToolsState["timelineFilters"],
    timelineShowFilters: false,
    explorerSelectedEndpoint: null as DevToolsState["explorerSelectedEndpoint"],
    graphLayout: "LR" as const,
    showSchemas: true,
    listSearch: "",
    listSortKey: "source" as const,
    listSortDir: "asc" as const,
    waterfallSortBy: "startTime" as const,
    waterfallGroupBy: "none" as const,
    waterfallZoom: 1,
    middlewareSelectedId: null as string | null,
    middlewareShowStats: false,
    compareLeftId: null as string | null,
    compareRightId: null as string | null,
    compareActiveTab: "response" as const,
    comparePickerSide: null as DevToolsState["comparePickerSide"],
    auditFilter: "all" as const,
    auditExpandedIds: new Set<string>(),
    playgroundHistory: [] as DevToolsState["playgroundHistory"],
    playgroundActiveResponse: null as DevToolsState["playgroundActiveResponse"],
    connected: false,
    settings: loadSettings(),
    sessionStartedAt: loadSessionStartedAt(),
  }
}
