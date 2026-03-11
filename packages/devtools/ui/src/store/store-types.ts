import type {
  Tab,
  Theme,
  ConnectionStatus,
  SessionInfo,
  RequestEntry,
  DevToolsEvent,
  TimelineFilters,
  PlaygroundHistoryEntry,
  ExplorerView,
  GraphLayout,
  ListSortKey,
  ListSortDir,
  WaterfallSortField,
  WaterfallGroupBy,
  CompareTab,
  AuditSeverityFilter,
  Toast,
} from "./types"

export interface DevToolsState {
  // UI
  activeTab: Tab
  theme: Theme
  toasts: Toast[]

  // Connection
  connectionStatus: ConnectionStatus
  reconnectAttempt: number
  connected: boolean
  sessions: SessionInfo[]

  // Requests
  requests: RequestEntry[]
  selectedRequestId: string | null
  paused: boolean
  preserveLog: boolean

  // Timeline filters
  timelineFilters: TimelineFilters
  timelineShowFilters: boolean

  // Explorer
  explorerView: ExplorerView
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
  middlewareSelectedId: string | null
  middlewareShowStats: boolean

  // Compare
  compareLeftId: string | null
  compareRightId: string | null
  compareActiveTab: CompareTab
  comparePickerSide: "left" | "right" | null

  // Audit
  auditFilter: AuditSeverityFilter
  auditExpandedIds: Set<string>

  // Playground
  playgroundHistory: PlaygroundHistoryEntry[]
  playgroundActiveResponse: PlaygroundHistoryEntry | null

  // Actions — UI
  setActiveTab: (tab: Tab) => void
  setTheme: (theme: Theme) => void
  showToast: (message: string, type?: Toast["type"]) => void
  dismissToast: (id: string) => void

  // Actions — Connection
  setConnectionStatus: (status: ConnectionStatus) => void
  setReconnectAttempt: (attempt: number) => void
  setSessions: (sessions: SessionInfo[]) => void
  addSession: (session: SessionInfo) => void
  removeSession: (sessionId: string) => void

  // Actions — Requests
  selectRequest: (id: string | null) => void
  togglePaused: () => void
  togglePreserveLog: () => void
  clearRequests: () => void
  togglePin: (id: string) => void
  handleEvent: (event: DevToolsEvent & Record<string, unknown>) => void

  // Actions — Timeline filters
  setTimelineFilters: (f: TimelineFilters) => void
  setTimelineShowFilters: (v: boolean) => void

  // Actions — Explorer
  setExplorerView: (view: ExplorerView) => void
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
  setMiddlewareSelectedId: (id: string | null) => void
  setMiddlewareShowStats: (show: boolean) => void

  // Actions — Compare
  setCompareLeftId: (id: string | null) => void
  setCompareRightId: (id: string | null) => void
  setCompareActiveTab: (tab: CompareTab) => void
  setComparePickerSide: (side: "left" | "right" | null) => void
  clearCompareSelection: () => void

  // Actions — Audit
  setAuditFilter: (filter: AuditSeverityFilter) => void
  toggleAuditExpanded: (id: string) => void

  // Actions — Playground
  addPlaygroundEntry: (entry: PlaygroundHistoryEntry) => void
  updatePlaygroundEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void
  setPlaygroundActiveResponse: (entry: PlaygroundHistoryEntry | null) => void
  clearPlaygroundHistory: () => void
}
