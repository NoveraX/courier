import { applyEvents } from "./apply-events";
import { createConnectionActions } from "./connection-actions";
import { DEFAULT_SETTINGS, saveSettings } from "./constants";
import { notifyOnEvents } from "./event-notifications";
import { holdEvents, releaseHeld } from "./held-requests";
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
    togglePaused: () =>
      set((s) => {
        if (!s.paused) return { paused: true };
        const { requests, droppedCount } = releaseHeld(
          s.heldRequests,
          s.requests,
          s.settings.maxRequests,
        );
        const droppedRequests = s.droppedRequests + droppedCount;
        return { paused: false, requests, heldRequests: [], droppedRequests };
      }),
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
          return { requests: pinned, heldRequests: [], droppedRequests: 0 };
        }
        return { requests: [], heldRequests: [], droppedRequests: 0 };
      }),
    showSession: (shownSession, requests) =>
      set({ shownSession, requests, heldRequests: [], droppedRequests: 0, paused: true }),
    showLive: () =>
      set({
        shownSession: null,
        requests: [],
        heldRequests: [],
        droppedRequests: 0,
        paused: false,
      }),
    togglePin: (id) =>
      set((s) => ({
        requests: s.requests.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
      })),
    setPinned: (ids, pinned) => {
      const named = new Set(ids);
      set((s) => ({
        requests: s.requests.map((r) =>
          named.has(r.id) && (r.pinned === true) !== pinned ? { ...r, pinned } : r,
        ),
      }));
    },

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
        /* A saved session shown in place of the live requests holds none. */
        const heldRequests =
          paused && !state.shownSession
            ? holdEvents(state.heldRequests, state.requests, events, {
                maxRequests,
                ignorePatterns,
              })
            : state.heldRequests;
        if (requests === state.requests && heldRequests === state.heldRequests) return state;
        return { requests, heldRequests, droppedRequests: state.droppedRequests + droppedCount };
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
      set((state) => {
        const requests = mergeReplayed(state.requests, replayed, {
          maxRequests,
          paused: state.paused,
        });
        if (!state.paused || state.shownSession) return { requests };
        /* What began while paused and the page did not see joins the held requests. */
        const shown = new Set(requests.map((r) => r.id));
        const missed = replayed.filter((r) => !shown.has(r.id));
        const heldRequests = mergeReplayed(state.heldRequests, missed, {
          maxRequests,
          paused: false,
        });
        return { requests, heldRequests };
      });
    },

    // Settings
    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      saveSettings(next);
      if (patch.theme) applyTheme(patch.theme);
      set({ settings: next, theme: next.theme });
    },
    resetSettings: () => {
      saveSettings(DEFAULT_SETTINGS);
      applyTheme(DEFAULT_SETTINGS.theme);
      set({ settings: DEFAULT_SETTINGS, theme: DEFAULT_SETTINGS.theme });
    },
  };
}
