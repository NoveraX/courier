import type {
  Theme,
  ConnectionStatus,
  Catalog,
  CatalogSnapshot,
  SessionInfo,
  RequestEntry,
  DevToolsEvent,
  PlaygroundHistoryEntry,
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

  // Catalog (server-authoritative merged source map)
  catalog: Catalog

  // Requests
  requests: RequestEntry[]
  paused: boolean

  // Audit
  auditExpandedIds: Set<string>

  // Playground
  playgroundHistory: PlaygroundHistoryEntry[]
  playgroundActiveResponse: PlaygroundHistoryEntry | null

  // Settings
  settings: Settings
  sessionStartedAt: number | null

  // Relative timestamp refresh (bumped by global interval)
  relativeTick: number

  // Request buffer overflow tracking
  droppedRequests: number

  // Actions — UI
  setTheme: (theme: Theme) => void

  // Actions — Connection
  setConnectionStatus: (status: ConnectionStatus) => void
  setReconnectAttempt: (attempt: number) => void
  setSessions: (sessions: SessionInfo[]) => void
  addSession: (session: SessionInfo) => void
  removeSession: (sessionId: string) => void

  // Actions — Catalog
  setCatalog: (snapshot: CatalogSnapshot) => void

  // Actions — Requests
  togglePaused: () => void
  togglePreserveLog: () => void
  clearRequests: () => void
  togglePin: (id: string) => void
  handleEvent: (event: DevToolsEvent & Record<string, unknown>) => void

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
