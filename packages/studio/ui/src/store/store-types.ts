import type {
  Theme,
  ConnectionStatus,
  Catalog,
  CatalogSnapshot,
  SessionInfo,
  RequestEntry,
  StudioEvent,
  PlaygroundHistoryEntry,
  Settings,
} from "./types"
import type { ScannedSource, SourceSummary } from "@/views/apis/types"

export interface StudioState {
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

  // APIs — live scan + registry (pushed via socket)
  scanSources: ScannedSource[]
  registrySources: SourceSummary[]

  // Audit
  auditExpandedIds: Set<string>

  // Playground
  playgroundHistory: PlaygroundHistoryEntry[]
  playgroundActiveResponse: PlaygroundHistoryEntry | null

  // Settings
  settings: Settings
  sessionStartedAt: number | null

  // Global client tick (bumped every 1s by useTickProvider)
  clientTick: number

  // Request buffer overflow tracking
  droppedRequests: number

  // Watcher (unified hot reload indicator)
  watcherApiPaths: number
  watcherMockFiles: number
  watcherLastChange: { source: "api" | "mock"; files: string[]; timestamp: number } | null

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

  // Actions — APIs
  setScanSources: (sources: ScannedSource[]) => void
  setRegistrySources: (sources: SourceSummary[]) => void

  // Actions — Requests
  togglePaused: () => void
  togglePreserveLog: () => void
  clearRequests: () => void
  togglePin: (id: string) => void
  handleEvent: (event: StudioEvent & Record<string, unknown>) => void

  // Actions — Audit
  toggleAuditExpanded: (id: string) => void

  // Actions — Playground
  addPlaygroundEntry: (entry: PlaygroundHistoryEntry) => void
  updatePlaygroundEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void
  setPlaygroundActiveResponse: (entry: PlaygroundHistoryEntry | null) => void
  clearPlaygroundHistory: () => void

  // Actions — Watcher
  setWatcherStatus: (apiPaths: number, mockFiles: number) => void
  setWatcherChange: (change: StudioState["watcherLastChange"]) => void

  // Actions — Settings
  updateSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void
}
