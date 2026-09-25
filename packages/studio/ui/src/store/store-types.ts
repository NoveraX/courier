import type {
  Theme,
  ConnectionStatus,
  BindingSnapshot,
  BindingErrorPayload,
  RequestEntry,
  StudioEvent,
  PlaygroundChunk,
  PlaygroundEndSummary,
  PlaygroundHistoryEntry,
  Settings,
} from "./types"
import type { ScannedSource, SourceSummary } from "@/views/apis/types"
import type { ConfigStatusPayload } from "./config-status"

export interface StudioState {
  // UI
  theme: Theme

  // Connection
  connectionStatus: ConnectionStatus
  reconnectAttempt: number
  connected: boolean

  // Binding-table snapshot (server-authoritative runtime/source ownership)
  bindingSnapshot: BindingSnapshot
  /** Latest binding error surfaced by the server (e.g. conflict). */
  lastBindingError: BindingErrorPayload | null

  // Requests
  requests: RequestEntry[]
  paused: boolean

  // APIs — live scan + registry (pushed via socket)
  scanSources: ScannedSource[]
  registrySources: SourceSummary[]
  /**
   * How `courier.config` loads, as Studio last told it; `null` until Studio
   * tells it after a connect. Studio sends it after the lists above, so the
   * lists describe the same state once it is set.
   */
  configStatus: ConfigStatusPayload | null

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

  // Actions — Binding snapshot
  setBindingSnapshot: (snapshot: BindingSnapshot) => void
  setBindingError: (error: BindingErrorPayload | null) => void

  // Actions — APIs
  setScanSources: (sources: ScannedSource[]) => void
  setRegistrySources: (sources: SourceSummary[]) => void
  setConfigStatus: (status: ConfigStatusPayload | null) => void

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
  /**
   * Append a `playground:chunk` payload to the entry matching `rid`. Called
   * from the UI socket listener; marks the entry's `streamStatus` as
   * `"streaming"` on the first chunk for SSE/WS transports so the UI can
   * transition out of the "connecting" state.
   */
  appendPlaygroundChunk: (rid: string, chunk: PlaygroundChunk) => void
  /**
   * Mark the rid-keyed entry as successfully complete. Uses `summary.durationMs`
   * to stamp the final `duration` so the status bar shows the runtime-side
   * wall-clock instead of the client roundtrip.
   */
  endPlayground: (rid: string, summary: PlaygroundEndSummary) => void
  /**
   * Mark the rid-keyed entry as errored. The error `message` becomes the
   * entry's `response` so the existing response panel renders it under the
   * error tab without special-casing.
   */
  errorPlayground: (rid: string, error: { message: string }) => void

  // Actions — Watcher
  setWatcherStatus: (apiPaths: number, mockFiles: number) => void
  setWatcherChange: (change: StudioState["watcherLastChange"]) => void

  // Actions — Settings
  updateSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void
}
