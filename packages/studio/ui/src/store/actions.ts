import type { StateCreator } from "zustand"

import type { StudioState } from "./store-types"
import type { createInitialState } from "./initial-state"

import { PLAYGROUND_MAX_HISTORY, DEFAULT_SETTINGS, saveSettings, saveSessionStartedAt } from "./constants"
import type { BindingSnapshot, PlaygroundHistoryEntry } from "./types-ui"
import { applyTheme } from "./theme"
import { applyDensity } from "./density"
import { handleEventReducer } from "./handle-event"
import { notifyOnEvent } from "./event-notifications"
import { normalizeEventSource, shouldIgnoreRequest } from "./actions-event-utils"

type Setter = Parameters<StateCreator<StudioState>>[0]
type Getter = Parameters<StateCreator<StudioState>>[1]

export function createActions(set: Setter, get: Getter): Omit<StudioState, keyof ReturnType<typeof createInitialState>> {
  return {
    // UI
    setTheme: (theme) => {
      const next = { ...get().settings, theme }
      saveSettings(next)
      applyTheme(theme)
      set({ theme, settings: next })
    },

    // Connection
    setConnectionStatus: (status) => {
      set({ connectionStatus: status, connected: status === "connected" })
      if (status === "connected") set({ reconnectAttempt: 0 })
    },
    setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),

    // Binding snapshot: server-authoritative replacement for the legacy
    // sessions[] slice. The session timer (`sessionStartedAt`) tracks the
    // first runtime arrival and clears when the last runtime leaves —
    // requests are NOT cleared on transitions because the studio dev server
    // can have several cooperating runtimes (browser direct + Next.js server
    // proxy) and HMR/Turbopack rebuilds blip them constantly; losing one
    // side's request history on a lifecycle blip is surprising and
    // asymmetric. Use clearRequests() for an explicit wipe.
    setBindingSnapshot: (snapshot: BindingSnapshot) =>
      set((s) => {
        const wasIdle = s.bindingSnapshot.runtimeCount === 0
        const isActive = snapshot.runtimeCount > 0
        let sessionStartedAt = s.sessionStartedAt
        if (wasIdle && isActive) {
          sessionStartedAt = sessionStartedAt ?? Date.now()
          if (!s.sessionStartedAt) saveSessionStartedAt(sessionStartedAt)
        } else if (!isActive && s.sessionStartedAt) {
          sessionStartedAt = null
          saveSessionStartedAt(null)
        }
        // Auto-clear a stale binding error when the underlying conflict row
        // is no longer present in the snapshot. The server only emits
        // binding:error on the moment of conflict; the corresponding "all
        // good now" signal is the next clean snapshot. Without this, a
        // resolved conflict leaves a permanent red badge in the status bar
        // until the user reloads — a UX lie.
        let lastBindingError = s.lastBindingError
        if (lastBindingError) {
          const stillConflicting = snapshot.rows.some(
            (r) =>
              r.status === "conflict" &&
              r.sourceName === lastBindingError?.details.sourceName &&
              r.transport === lastBindingError?.details.transport,
          )
          if (!stillConflicting) lastBindingError = null
        }
        return { bindingSnapshot: snapshot, sessionStartedAt, lastBindingError }
      }),
    setBindingError: (error) => set({ lastBindingError: error }),

    // APIs — live scan + registry (pushed via socket, no HTTP round-trip)
    setScanSources: (sources) => set({ scanSources: sources }),
    setRegistrySources: (sources) => set({ registrySources: sources }),
    setConfigStatus: (status) => set({ configStatus: status }),

    // Requests
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    togglePreserveLog: () => {
      const next = !get().settings.preserveLog
      const settings = { ...get().settings, preserveLog: next }
      saveSettings(settings)
      set({ settings })
    },
    clearRequests: () =>
      set((s) => {
        if (s.settings.preserveLog) {
          const pinned = s.requests.filter((r) => r.pinned)
          return { requests: pinned, droppedRequests: 0 }
        }
        return { requests: [], droppedRequests: 0 }
      }),
    togglePin: (id) =>
      set((s) => ({
        requests: s.requests.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
      })),

    // Audit
    toggleAuditExpanded: (id) =>
      set((s) => {
        const next = new Set(s.auditExpandedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { auditExpandedIds: next }
      }),

    // Playground
    addPlaygroundEntry: (entry) =>
      set((s) => ({
        playgroundHistory: [entry, ...s.playgroundHistory].slice(0, PLAYGROUND_MAX_HISTORY),
        playgroundActiveResponse: entry,
      })),
    updatePlaygroundEntry: (id, patch) =>
      set((s) => {
        const updated = s.playgroundHistory.map((h) => (h.id === id ? { ...h, ...patch } : h))
        const active =
          s.playgroundActiveResponse?.id === id
            ? { ...s.playgroundActiveResponse, ...patch }
            : s.playgroundActiveResponse
        return { playgroundHistory: updated, playgroundActiveResponse: active }
      }),
    setPlaygroundActiveResponse: (entry) => set({ playgroundActiveResponse: entry }),
    clearPlaygroundHistory: () => set({ playgroundHistory: [], playgroundActiveResponse: null }),

    // Rid-keyed playground wire reducers. Called from UI socket listeners
    // for `playground:chunk` / `playground:end` / `playground:error`. Routed
    // by the `rid` stamped on the entry at send time so the playground
    // history stays decoupled from any server-assigned correlation id.
    //
    // Orphan handling: if the target entry has been cleared from history
    // (user hit "Clear"), the reducer is a silent no-op. The server-side
    // inFlight entry is drained via `onUiDisconnect` on the next socket
    // teardown, so dropping orphans here does not leak state.
    appendPlaygroundChunk: (rid, chunk) =>
      set((s) => {
        const patch = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry => {
          const nextChunks = [...(entry.chunks ?? []), chunk]
          const next: PlaygroundHistoryEntry = { ...entry, chunks: nextChunks }
          if (chunk.kind === "http-result") {
            next.statusCode = chunk.status
            next.response = chunk.error ?? chunk.data
          } else if (entry.streamStatus === "connecting") {
            next.streamStatus = "streaming"
          }
          return next
        }
        const updated = s.playgroundHistory.map((h) => (h.rid === rid ? patch(h) : h))
        const active =
          s.playgroundActiveResponse?.rid === rid ? patch(s.playgroundActiveResponse) : s.playgroundActiveResponse
        return { playgroundHistory: updated, playgroundActiveResponse: active }
      }),
    endPlayground: (rid, summary) =>
      set((s) => {
        const patch = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry => {
          // A failing http-result keeps the "error" status rather than
          // flipping to success on the terminal end event.
          const errored =
            entry.status === "error" ||
            (entry.chunks?.some((c) => c.kind === "http-result" && c.error !== undefined) ?? false)
          return {
            ...entry,
            status: errored ? "error" : "success",
            duration: summary.durationMs,
            streamStatus: entry.transport ? (errored ? "error" : "complete") : entry.streamStatus,
          }
        }
        const updated = s.playgroundHistory.map((h) => (h.rid === rid ? patch(h) : h))
        const active =
          s.playgroundActiveResponse?.rid === rid ? patch(s.playgroundActiveResponse) : s.playgroundActiveResponse
        return { playgroundHistory: updated, playgroundActiveResponse: active }
      }),
    errorPlayground: (rid, error) =>
      set((s) => {
        const patch = (entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry => ({
          ...entry,
          status: "error",
          response: error.message,
          streamStatus: entry.transport ? "error" : entry.streamStatus,
        })
        const updated = s.playgroundHistory.map((h) => (h.rid === rid ? patch(h) : h))
        const active =
          s.playgroundActiveResponse?.rid === rid ? patch(s.playgroundActiveResponse) : s.playgroundActiveResponse
        return { playgroundHistory: updated, playgroundActiveResponse: active }
      }),

    handleEvent: (event) => {
      if (get().paused) return
      // Skip requests matching ignore patterns
      if (event.type === "request:start" && shouldIgnoreRequest(event, get().settings.ignorePatterns)) return
      // Normalize event source name (case-insensitive). Was originally
      // reconciled against the server-side CatalogStore which was populated
      // by the AST scanner; the scanner was removed in 6.1.4b so the
      // normalization is now a no-op. Kept for future use if a source name
      // registry is re-introduced.
      const normalized = normalizeEventSource(event, {})
      set((state) => {
        const result = handleEventReducer(state, normalized, get().settings.maxRequests)
        if ("droppedCount" in result && result.droppedCount) {
          return { ...result, droppedRequests: state.droppedRequests + result.droppedCount }
        }
        return result
      })
      notifyOnEvent(normalized, get)
    },

    // Watcher
    setWatcherStatus: (apiPaths, mockFiles) => set({ watcherApiPaths: apiPaths, watcherMockFiles: mockFiles }),
    setWatcherChange: (change) => set({ watcherLastChange: change }),

    // Settings
    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch }
      saveSettings(next)
      if (patch.theme) applyTheme(patch.theme)
      if (patch.density) applyDensity(patch.density)
      set({ settings: next })
    },
    resetSettings: () => {
      saveSettings(DEFAULT_SETTINGS)
      applyTheme(DEFAULT_SETTINGS.theme)
      applyDensity(DEFAULT_SETTINGS.density)
      set({ settings: DEFAULT_SETTINGS })
    },
  }
}
