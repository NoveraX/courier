import type { StateCreator } from "zustand"

import type { DevToolsState } from "./store-types"
import { THEME_STORAGE_KEY, TAB_STORAGE_KEY, PLAYGROUND_MAX_HISTORY } from "./constants"
import { applyTheme } from "./theme"
import { handleEventReducer } from "./handle-event"

type Setter = Parameters<StateCreator<DevToolsState>>[0]
type Getter = Parameters<StateCreator<DevToolsState>>[1]

export function createActions(set: Setter, get: Getter): Omit<DevToolsState, keyof ReturnType<typeof createInitialState>> {
  return {
    // UI
    setActiveTab: (tab) => {
      localStorage.setItem(TAB_STORAGE_KEY, tab)
      set({ activeTab: tab })
    },
    setTheme: (theme) => {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
      applyTheme(theme)
      set({ theme })
    },
    showToast: (message, type = "info") => {
      const id = `toast_${Date.now().toString(36)}`
      set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
      setTimeout(() => get().dismissToast(id), 3000)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    // Connection
    setConnectionStatus: (status) => {
      set({ connectionStatus: status })
      if (status === "connected") set({ reconnectAttempt: 0 })
    },
    setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),
    setSessions: (sessions) => set({ sessions }),
    addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
    removeSession: (sessionId) =>
      set((s) => ({
        sessions: s.sessions.filter((ss) => ss.sessionId !== sessionId),
        requests: s.preserveLog
          ? s.requests
          : s.requests.filter((r) => r.sessionId !== sessionId || r.pinned),
      })),

    // Requests
    selectRequest: (id) => set({ selectedRequestId: id }),
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    togglePreserveLog: () => set((s) => ({ preserveLog: !s.preserveLog })),
    clearRequests: () =>
      set((s) => {
        if (s.preserveLog) {
          const pinned = s.requests.filter((r) => r.pinned)
          return { requests: pinned, selectedRequestId: null }
        }
        return { requests: [], selectedRequestId: null }
      }),
    togglePin: (id) =>
      set((s) => ({
        requests: s.requests.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
      })),

    // Timeline filters
    setTimelineFilters: (f) => set({ timelineFilters: f }),
    setTimelineShowFilters: (v) => set({ timelineShowFilters: v }),

    // Explorer
    setExplorerView: (view) => set({ explorerView: view }),
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
    setMiddlewareSelectedId: (id) => set({ middlewareSelectedId: id }),
    setMiddlewareShowStats: (show) => set({ middlewareShowStats: show }),

    // Compare
    setCompareLeftId: (id) => set({ compareLeftId: id }),
    setCompareRightId: (id) => set({ compareRightId: id }),
    setCompareActiveTab: (tab) => set({ compareActiveTab: tab }),
    setComparePickerSide: (side) => set({ comparePickerSide: side }),
    clearCompareSelection: () => set({ compareLeftId: null, compareRightId: null, comparePickerSide: null }),

    // Audit
    setAuditFilter: (filter) => set({ auditFilter: filter }),
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
      set((state) => handleEventReducer(state, event))
    },
  }
}

export function createInitialState(savedTheme: DevToolsState["theme"], savedTab: DevToolsState["activeTab"]) {
  return {
    activeTab: savedTab,
    theme: savedTheme,
    toasts: [] as DevToolsState["toasts"],
    connectionStatus: "disconnected" as const,
    reconnectAttempt: 0,
    sessions: [] as DevToolsState["sessions"],
    requests: [] as DevToolsState["requests"],
    selectedRequestId: null as string | null,
    paused: false,
    preserveLog: false,
    timelineFilters: { search: "", status: [], mode: [], type: [], httpMethod: [], source: [], group: [], minDuration: null } as DevToolsState["timelineFilters"],
    timelineShowFilters: false,
    explorerView: "graph" as const,
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
  }
}
