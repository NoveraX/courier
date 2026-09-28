import type { StudioGet, StudioSet } from "./store-access"
import type { StudioState } from "./store-types"
import type { createInitialState } from "./initial-state"

import { createConnectionActions } from "./connection-actions"
import { DEFAULT_SETTINGS, saveSettings } from "./constants"
import { createPlaygroundActions } from "./playground-actions"
import { createProjectActions } from "./project-actions"
import { applyTheme } from "./theme"
import { applyDensity } from "./density"
import { handleEventReducer } from "./handle-event"
import { notifyOnEvent } from "./event-notifications"
import { normalizeEventSource, shouldIgnoreRequest } from "./actions-event-utils"

export function createActions(set: StudioSet, get: StudioGet): Omit<StudioState, keyof ReturnType<typeof createInitialState>> {
  return {
    // UI
    setTheme: (theme) => {
      const next = { ...get().settings, theme }
      saveSettings(next)
      applyTheme(theme)
      set({ theme, settings: next })
    },

    ...createConnectionActions(set),
    ...createProjectActions(set),
    ...createPlaygroundActions(set),

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

    handleEvent: (event) => {
      if (get().paused) return
      // Skip requests matching ignore patterns
      if (event.type === "request:start" && shouldIgnoreRequest(event, get().settings.ignorePatterns)) return
      // Source names are matched case-insensitively against a catalogue of
      // known names; with the empty one passed here, each passes as sent.
      const normalized = normalizeEventSource(event, {})
      set((state) => {
        const { requests, droppedCount } = handleEventReducer(state, normalized, get().settings.maxRequests)
        if (requests === state.requests) return state
        return { requests, droppedRequests: state.droppedRequests + droppedCount }
      })
      notifyOnEvent(normalized, get)
    },

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
