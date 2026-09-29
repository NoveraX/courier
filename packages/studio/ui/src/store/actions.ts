import { applyEvents } from "./apply-events";
import { createConnectionActions } from "./connection-actions";
import { DEFAULT_SETTINGS, saveSettings } from "./constants";
import { applyDensity } from "./density";
import { notifyOnEvents } from "./event-notifications";
import type { createInitialState } from "./initial-state";
import { mergeReplayed } from "./merge-replayed";
import { createPlaygroundActions } from "./playground-actions";
import { createProjectActions } from "./project-actions";
import type { StudioGet, StudioSet } from "./store-access";
import type { StudioState } from "./store-types";
import { applyTheme } from "./theme";

export function createActions(
  set: StudioSet,
  get: StudioGet,
): Omit<StudioState, keyof ReturnType<typeof createInitialState>> {
  return {
    // UI
    setTheme: (theme) => {
      const next = { ...get().settings, theme };
      saveSettings(next);
      applyTheme(theme);
      set({ theme, settings: next });
    },

    ...createConnectionActions(set),
    ...createProjectActions(set),
    ...createPlaygroundActions(set),

    // Requests
    togglePaused: () => set((s) => ({ paused: !s.paused })),
    togglePreserveLog: () => {
      const next = !get().settings.preserveLog;
      const settings = { ...get().settings, preserveLog: next };
      saveSettings(settings);
      set({ settings });
    },
    clearRequests: () =>
      set((s) => {
        if (s.settings.preserveLog) {
          const pinned = s.requests.filter((r) => r.pinned);
          return { requests: pinned, droppedRequests: 0 };
        }
        return { requests: [], droppedRequests: 0 };
      }),
    showSession: (shownSession, requests) =>
      set({ shownSession, requests, droppedRequests: 0, paused: true }),
    showLive: () => set({ shownSession: null, requests: [], droppedRequests: 0, paused: false }),
    togglePin: (id) =>
      set((s) => ({
        requests: s.requests.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
      })),

    // Audit
    toggleAuditExpanded: (id) =>
      set((s) => {
        const next = new Set(s.auditExpandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { auditExpandedIds: next };
      }),

    handleEvents: (events) => {
      const {
        settings: { maxRequests, ignorePatterns },
        paused,
      } = get();
      set((state) => {
        const { requests, droppedCount } = applyEvents(state.requests, events, {
          maxRequests,
          ignorePatterns,
          paused,
        });
        if (requests === state.requests) return state;
        return { requests, droppedRequests: state.droppedRequests + droppedCount };
      });
      if (!paused) notifyOnEvents(events, get);
    },
    replayEvents: (events) => {
      const { maxRequests, ignorePatterns } = get().settings;
      const { requests: replayed } = applyEvents([], events, {
        maxRequests,
        ignorePatterns,
        paused: false,
      });
      set((state) => ({
        requests: mergeReplayed(state.requests, replayed, { maxRequests, paused: state.paused }),
      }));
    },

    // Settings
    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      saveSettings(next);
      if (patch.theme) applyTheme(patch.theme);
      if (patch.density) applyDensity(patch.density);
      set({ settings: next, theme: next.theme });
    },
    resetSettings: () => {
      saveSettings(DEFAULT_SETTINGS);
      applyTheme(DEFAULT_SETTINGS.theme);
      applyDensity(DEFAULT_SETTINGS.density);
      set({ settings: DEFAULT_SETTINGS, theme: DEFAULT_SETTINGS.theme });
    },
  };
}
