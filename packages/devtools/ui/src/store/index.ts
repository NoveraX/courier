import { create } from "zustand"

import type { DevToolsState } from "./store-types"
import { loadTheme, loadTab } from "./constants"
import { applyTheme } from "./theme"
import { createActions, createInitialState } from "./actions"

// Re-export everything consumers need
export * from "./types"
export type { DevToolsState } from "./store-types"
export { EMPTY_FILTERS, PLAYGROUND_MAX_HISTORY, MAX_REQUESTS } from "./constants"

// ── Initialize theme ────────────────────────────────────────────────────────

const savedTheme = loadTheme()
const savedTab = loadTab()
applyTheme(savedTheme)

// ── Store ───────────────────────────────────────────────────────────────────

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  ...createInitialState(savedTheme, savedTab),
  get connected() {
    return get().connectionStatus === "connected"
  },
  ...createActions(set, get),
}))
