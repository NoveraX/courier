import type { StateCreator } from "zustand"

import type { StudioState } from "./store-types"
import type { createInitialState } from "./initial-state"

import { PLAYGROUND_MAX_HISTORY, DEFAULT_SETTINGS, saveSettings, saveSessionStartedAt } from "./constants"
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
        // Requests are NOT cleared on session disconnect. Browser-tab Studio
        // sessions can churn from HMR / Turbopack rebuilds / hard reloads,
        // and the studio dev server can have multiple cooperating sessions
        // (browser direct + Next.js server proxy) — losing one side's
        // request history when its session lifecycle blips is both
        // surprising and asymmetric (the surviving session keeps showing
        // its entries). DevTools-style retention: use clearRequests() for
        // an explicit wipe.
        return { sessions, sessionStartedAt }
      }),

    // Catalog (server-authoritative — NOT gated by paused flag)
    setCatalog: (snapshot) => set({ catalog: snapshot.catalog }),

    // APIs — live scan + registry (pushed via socket, no HTTP round-trip)
    setScanSources: (sources) => set({ scanSources: sources }),
    setRegistrySources: (sources) => set({ registrySources: sources }),

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

    handleEvent: (event) => {
      if (get().paused) return
      // Skip requests matching ignore patterns
      if (event.type === "request:start" && shouldIgnoreRequest(event, get().settings.ignorePatterns)) return
      // Normalize event source name against catalog (case-insensitive).
      // Runtime emits lowercase (from URL hostname), catalog uses scanner names (PascalCase).
      const normalized = normalizeEventSource(event, get().catalog)
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
