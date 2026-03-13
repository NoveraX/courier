import type {
  Theme,
  ConnectionStatus,
  SessionInfo,
  SourceMap,
  RequestEntry,
  DevToolsEvent,
  PlaygroundHistoryEntry,
  GraphLayout,
  ListSortKey,
  ListSortDir,
  WaterfallSortField,
  WaterfallGroupBy,
  Settings,
} from "./types"

export interface DevToolsState {
  // UI
  theme: Theme

  // Connection
  connectionStatus: ConnectionStatus
  reconnectAttempt: number
  connected: boolean
  sessions: SessionInfo[]

  // Requests
  requests: RequestEntry[]
  paused: boolean
  preserveLog: boolean

  // Explorer
  explorerSelectedEndpoint: { source: string; group: string; method: string } | null
  graphLayout: GraphLayout
  showSchemas: boolean
  listSearch: string
  listSortKey: ListSortKey
  listSortDir: ListSortDir

  // Waterfall
  waterfallSortBy: WaterfallSortField
  waterfallGroupBy: WaterfallGroupBy
  waterfallZoom: number

  // Middleware
  middlewareShowStats: boolean

  // Compare (transient UI only — IDs and tab are in URL)
  comparePickerSide: "left" | "right" | null

  // Audit
  auditExpandedIds: Set<string>

  // Playground
  playgroundHistory: PlaygroundHistoryEntry[]
  playgroundActiveResponse: PlaygroundHistoryEntry | null

  // Settings
  settings: Settings
  sessionStartedAt: number | null

  // Actions — UI
  setTheme: (theme: Theme) => void

  // Actions — Connection
  setConnectionStatus: (status: ConnectionStatus) => void
  setReconnectAttempt: (attempt: number) => void
  setSessions: (sessions: SessionInfo[]) => void
  addSession: (session: SessionInfo) => void
  removeSession: (sessionId: string) => void
  updateSessionSources: (sessionId: string, sources: SourceMap) => void

  // Actions — Requests
  togglePaused: () => void
  togglePreserveLog: () => void
  clearRequests: () => void
  togglePin: (id: string) => void
  handleEvent: (event: DevToolsEvent & Record<string, unknown>) => void

  // Actions — Explorer
  setExplorerSelectedEndpoint: (ep: { source: string; group: string; method: string } | null) => void
  setGraphLayout: (layout: GraphLayout) => void
  setShowSchemas: (show: boolean) => void
  setListSearch: (search: string) => void
  setListSortKey: (key: ListSortKey) => void
  setListSortDir: (dir: ListSortDir) => void

  // Actions — Waterfall
  setWaterfallSortBy: (sort: WaterfallSortField) => void
  setWaterfallGroupBy: (group: WaterfallGroupBy) => void
  setWaterfallZoom: (zoom: number) => void

  // Actions — Middleware
  setMiddlewareShowStats: (show: boolean) => void

  // Actions — Compare
  setComparePickerSide: (side: "left" | "right" | null) => void

  // Actions — Audit
  toggleAuditExpanded: (id: string) => void

  // Actions — Playground
  addPlaygroundEntry: (entry: PlaygroundHistoryEntry) => void
  updatePlaygroundEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void
  setPlaygroundActiveResponse: (entry: PlaygroundHistoryEntry | null) => void
  clearPlaygroundHistory: () => void

  // Actions — Settings
  updateSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void
}
