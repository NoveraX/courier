import type { StateCreator } from "zustand"
import { toast } from "sonner"

import type { Catalog, CatalogSnapshot, DevToolsEvent } from "./types"
import type { DevToolsState } from "./store-types"
import { THEME_STORAGE_KEY, PLAYGROUND_MAX_HISTORY, DEFAULT_SETTINGS, saveSettings, saveSessionStartedAt } from "./constants"
import { applyTheme } from "./theme"
import { handleEventReducer } from "./handle-event"
import { notifyOnEvent } from "./event-notifications"
import { createInitialState } from "./initial-state"

type Setter = Parameters<StateCreator<DevToolsState>>[0]
type Getter = Parameters<StateCreator<DevToolsState>>[1]

/** Toast on catalog change — debounced to avoid spam */
let lastCatalogHash = ""
let catalogToastTimer: ReturnType<typeof setTimeout> | undefined
function catalogChangedToast(catalog: CatalogSnapshot["catalog"]): void {
  const hash = JSON.stringify(catalog)
  if (!lastCatalogHash || lastCatalogHash === hash) {
    lastCatalogHash = hash
    return
  }
  lastCatalogHash = hash
  clearTimeout(catalogToastTimer)
  catalogToastTimer = setTimeout(() => toast.info("Sources updated"), 300)
}

/**
 * Normalize event source name against catalog keys (case-insensitive).
 * Runtime emits lowercase names (from URL hostname), catalog uses
 * scanner-derived names (PascalCase). This is the single reconciliation
 * point — all views read from the store and never see the mismatch.
 */
let canonMap: Map<string, string> | null = null
let canonMapCatalog: Catalog | null = null

type EventPayload = DevToolsEvent & Record<string, unknown>

function normalizeEventSource(
  event: EventPayload,
  catalog: Catalog,
): EventPayload {
  if (!event.source || typeof event.source !== "string") return event

  // Rebuild lookup only when catalog reference changes
  if (catalog !== canonMapCatalog) {
    canonMap = new Map()
    for (const key of Object.keys(catalog)) {
      canonMap.set(key.toLowerCase(), key)
    }
    canonMapCatalog = catalog
  }

  const canonical = canonMap!.get((event.source as string).toLowerCase())
  if (canonical && canonical !== event.source) {
    return { ...event, source: canonical }
  }
  return event
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

    // Catalog (server-authoritative — NOT gated by paused flag)
    setCatalog: (snapshot) => {
      catalogChangedToast(snapshot.catalog)
      set({ catalog: snapshot.catalog })
    },

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
      // Normalize event source name against catalog (case-insensitive).
      // Runtime emits lowercase (from URL hostname), catalog uses scanner names (PascalCase).
      const normalized = normalizeEventSource(event, get().catalog)
      set((state) => handleEventReducer(state, normalized))
      notifyOnEvent(normalized, get)
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
