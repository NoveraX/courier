import type { Tab, Theme, TimelineFilters } from "./types"

export const PLAYGROUND_MAX_HISTORY = 50

/** Maximum number of requests kept in memory */
export const MAX_REQUESTS = 2000

export const EMPTY_FILTERS: TimelineFilters = {
  search: "",
  status: [],
  mode: [],
  type: [],
  httpMethod: [],
  source: [],
  group: [],
  minDuration: null,
}

// ── Safe localStorage reads ─────────────────────────────────────────────────

export const THEME_STORAGE_KEY = "nexus-devtools-theme"
export const TAB_STORAGE_KEY = "nexus-devtools-tab"

const VALID_THEMES: ReadonlySet<string> = new Set<Theme>(["dark", "light", "system"])
const VALID_TABS: ReadonlySet<string> = new Set<Tab>([
  "timeline", "waterfall", "middleware", "analytics", "explorer",
  "playground", "audit", "codegen", "compare", "settings",
])

export function loadTheme(): Theme {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return raw && VALID_THEMES.has(raw) ? (raw as Theme) : "dark"
}

export function loadTab(): Tab {
  const raw = localStorage.getItem(TAB_STORAGE_KEY)
  return raw && VALID_TABS.has(raw) ? (raw as Tab) : "timeline"
}
