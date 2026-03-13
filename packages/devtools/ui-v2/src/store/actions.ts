import type { StateCreator } from "zustand"
import { toast } from "sonner"

import type { SourceMap } from "./types"
import type { DevToolsState } from "./store-types"
import { THEME_STORAGE_KEY, PLAYGROUND_MAX_HISTORY, DEFAULT_SETTINGS, saveSettings, saveSessionStartedAt } from "./constants"
import { applyTheme } from "./theme"
import { handleEventReducer } from "./handle-event"
import { notifyOnEvent } from "./event-notifications"
import { createInitialState } from "./initial-state"

type Setter = Parameters<StateCreator<DevToolsState>>[0]
type Getter = Parameters<StateCreator<DevToolsState>>[1]

/** Collapse rapid-fire "Sources updated" toasts into a single one */
let sourcesToastTimer: ReturnType<typeof setTimeout> | undefined
function debouncedSourcesToast(): void {
  clearTimeout(sourcesToastTimer)
  sourcesToastTimer = setTimeout(() => toast.info("Sources updated"), 500)
}

export function createActions(set: Setter, get: Getter): Omit<DevToolsState, keyof ReturnType<typeof createInitialState>> {
  return {
    // UI
    setTheme: (theme) => {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
      applyTheme(theme)
      set({ theme })
    },

    // Connection
    setConnectionStatus: (status) => {
      set({ connectionStatus: status, connected: status === "connected" })
      if (status === "connected") set({ reconnectAttempt: 0 })
    },
    setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
    setSessions: (sessions) => set({ sessions }),
    addSession: (session) => set((s) => {
      const sessionStartedAt = s.sessionStartedAt ?? Date.now()
      if (!s.sessionStartedAt) saveSessionStartedAt(sessionStartedAt)
      return {
        sessions: [...s.sessions, session],
        sessionStartedAt,
      }
    }),
    removeSession: (sessionId) =>
      set((s) => {
        const sessions = s.sessions.filter((ss) => ss.sessionId !== sessionId)
        const sessionStartedAt = sessions.length === 0 ? null : s.sessionStartedAt
        if (sessions.length === 0) saveSessionStartedAt(null)
        return {
          sessions,
          sessionStartedAt,
          requests: s.preserveLog
            ? s.requests
            : s.requests.filter((r) => r.sessionId !== sessionId || r.pinned),
        }
      }),
    updateSessionSources: (sessionId, sources) =>
      set((s) => ({
        sessions: s.sessions.map((ss) =>
          ss.sessionId === sessionId ? { ...ss, sources } : ss
        ),
      })),

    // Requests
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    togglePreserveLog: () => set((s) => ({ preserveLog: !s.preserveLog })),
    clearRequests: () =>
      set((s) => {
        if (s.preserveLog) {
          const pinned = s.requests.filter((r) => r.pinned)
          return { requests: pinned }
        }
        return { requests: [] }
      }),
    togglePin: (id) =>
      set((s) => ({
        requests: s.requests.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
      })),

    // Explorer
    setExplorerSelectedEndpoint: (ep) => set({ explorerSelectedEndpoint: ep }),
    setGraphLayout: (layout) => set({ graphLayout: layout }),
    setShowSchemas: (show) => set({ showSchemas: show }),
    setListSearch: (search) => set({ listSearch: search }),
    setListSortKey: (key) => set({ listSortKey: key }),
    setListSortDir: (dir) => set({ listSortDir: dir }),

    // Waterfall
    setWaterfallSortBy: (sort) => set({ waterfallSortBy: sort }),
    setWaterfallGroupBy: (group) => set({ waterfallGroupBy: group }),
    setWaterfallZoom: (zoom) => set({ waterfallZoom: zoom }),

    // Middleware
    setMiddlewareShowStats: (show) => set({ middlewareShowStats: show }),

    // Compare
    setComparePickerSide: (side) => set({ comparePickerSide: side }),

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

    handleEvent: (event) => {
      if (get().paused) return

      // Hot reload: update session sources without going through request reducer
      if (event.type === "connection:sources" && event.sources) {
        get().updateSessionSources(event.sessionId, event.sources as SourceMap)
        debouncedSourcesToast()
        return
      }

      set((state) => handleEventReducer(state, event))
      notifyOnEvent(event, get)
    },

    // Settings
    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch }
      saveSettings(next)
      set({ settings: next })
    },
    resetSettings: () => {
      saveSettings(DEFAULT_SETTINGS)
      set({ settings: DEFAULT_SETTINGS })
    },
  }
}
