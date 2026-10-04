import type { ScannedSource, SourceSummary } from "@/views/apis/types";
import type { ConfigStatusPayload } from "./config-status";
import type { MocksFileStatus } from "./mocks-file-status";
import type { StudioInfo } from "./studio-info";
import type {
  BindingErrorPayload,
  BindingSnapshot,
  ConnectionStatus,
  PlaygroundChunk,
  PlaygroundEndSummary,
  PlaygroundHistoryEntry,
  RequestEntry,
  Settings,
  StudioEvent,
  Theme,
} from "./types";

/** A saved session shown in place of the live requests */
export interface ShownSession {
  id: string;
  name: string;
}

export interface StudioState {
  // UI
  theme: Theme;

  /** Studio's version and the project's name, as Studio last told them; `null` until it does. */
  studioInfo: StudioInfo | null;

  // Connection
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  connected: boolean;

  // Binding-table snapshot (server-authoritative runtime/source ownership)
  bindingSnapshot: BindingSnapshot;
  /** Latest binding error surfaced by the server (e.g. conflict). */
  lastBindingError: BindingErrorPayload | null;

  // Requests
  requests: RequestEntry[];
  paused: boolean;
  /** Requests that began while recording was paused, held out of the list until it resumes. */
  heldRequests: RequestEntry[];
  /** The saved session shown in place of the live requests; `null` while they show. */
  shownSession: ShownSession | null;

  // APIs — live scan + registry (pushed via socket)
  scanSources: ScannedSource[];
  registrySources: SourceSummary[];
  /**
   * How `courier.config` loads, as Studio last told it; `null` until Studio
   * tells it after a connect. Studio sends it after the lists above, so the
   * lists describe the same state once it is set.
   */
  configStatus: ConfigStatusPayload | null;
  /**
   * How `courier.mocks.*` loads, as Studio last told it in `mocks:status`;
   * `null` until Studio tells it after a connect.
   */
  mocksFileStatus: MocksFileStatus | null;

  // Audit
  auditExpandedIds: Set<string>;

  // Playground
  playgroundHistory: PlaygroundHistoryEntry[];
  playgroundActiveResponse: PlaygroundHistoryEntry | null;

  // Settings
  settings: Settings;
  sessionStartedAt: number | null;

  // Global client tick (bumped every 1s by useTickProvider)
  clientTick: number;

  // Request buffer overflow tracking
  droppedRequests: number;

  // Watcher (unified hot reload indicator)
  watcherApiPaths: number;
  /** When Studio began to watch that many files, once it said so. */
  watcherSince: number | null;
  watcherLastChange: { source: "api" | "mock"; files: string[]; timestamp: number } | null;

  // Actions — UI
  setTheme: (theme: Theme) => void;

  // Actions — Connection
  setStudioInfo: (info: StudioInfo) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setReconnectAttempt: (attempt: number) => void;

  // Actions — Binding snapshot
  setBindingSnapshot: (snapshot: BindingSnapshot) => void;
  setBindingError: (error: BindingErrorPayload | null) => void;

  // Actions — APIs
  setScanSources: (sources: ScannedSource[]) => void;
  setRegistrySources: (sources: SourceSummary[]) => void;
  setConfigStatus: (status: ConfigStatusPayload | null) => void;
  setMocksFileStatus: (status: MocksFileStatus | null) => void;

  // Actions — Requests
  /** Pause recording, or resume it: the requests held meanwhile join the list on top. */
  togglePaused: () => void;
  togglePreserveLog: () => void;
  clearRequests: () => void;
  /** Show a saved session's requests in place of the live ones, recording paused. */
  showSession: (session: ShownSession, requests: RequestEntry[]) => void;
  /** Show the live requests again: the saved session goes, and recording resumes. */
  showLive: () => void;
  togglePin: (id: string) => void;
  /** Take in a batch of runtime events, oldest first, in one store update. */
  handleEvents: (events: Array<StudioEvent & Record<string, unknown>>) => void;
  /**
   * Take in the events Studio replays on connect — every request it
   * captured, oldest first — merged with the requests already held.
   */
  replayEvents: (events: Array<StudioEvent & Record<string, unknown>>) => void;

  // Actions — Audit
  toggleAuditExpanded: (id: string) => void;

  // Actions — Playground
  addPlaygroundEntry: (entry: PlaygroundHistoryEntry) => void;
  updatePlaygroundEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void;
  setPlaygroundActiveResponse: (entry: PlaygroundHistoryEntry | null) => void;
  clearPlaygroundHistory: () => void;
  /**
   * Append a `playground:chunk` payload to the entry matching `rid`. Called
   * from the UI socket listener; marks the entry's `streamStatus` as
   * `"streaming"` on the first chunk for SSE/WS transports so the UI can
   * transition out of the "connecting" state.
   */
  appendPlaygroundChunk: (rid: string, chunk: PlaygroundChunk) => void;
  /**
   * Mark the rid-keyed entry as successfully complete. Uses `summary.durationMs`
   * to stamp the final `duration` so the status bar shows the runtime-side
   * wall-clock instead of the client roundtrip.
   */
  endPlayground: (rid: string, summary: PlaygroundEndSummary) => void;
  /**
   * Mark the rid-keyed entry as errored. The error `message` becomes the
   * entry's `response` so the existing response panel renders it under the
   * error tab without special-casing.
   */
  errorPlayground: (rid: string, error: { message: string }) => void;

  // Actions — Watcher
  setWatcherStatus: (apiPaths: number, since: number) => void;
  setWatcherChange: (change: StudioState["watcherLastChange"]) => void;

  // Actions — Settings
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
}
