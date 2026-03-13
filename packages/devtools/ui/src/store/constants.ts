import type { Tab, Theme, TimelineFilters, Settings } from "./types"

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

// ── Default settings ────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  maxRequests: 2000,
  preserveLog: false,
  timestampFormat: "relative",
  jsonIndent: 2,
  showRequestPreview: true,
  toastOnError: true,
  toastOnSlowRequest: true,
  slowRequestThreshold: 500,
}

// ── Safe localStorage reads ─────────────────────────────────────────────────

export const THEME_STORAGE_KEY = "nexus-devtools-theme"
export const TAB_STORAGE_KEY = "nexus-devtools-tab"
export const SETTINGS_STORAGE_KEY = "nexus-devtools-settings"
export const SESSION_STARTED_KEY = "nexus-devtools-session-started"

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

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function loadSessionStartedAt(): number | null {
  const raw = localStorage.getItem(SESSION_STARTED_KEY)
  if (!raw) return null
  const val = Number(raw)
  return Number.isFinite(val) ? val : null
}

export function saveSessionStartedAt(value: number | null): void {
  if (value === null) {
    localStorage.removeItem(SESSION_STARTED_KEY)
  } else {
    localStorage.setItem(SESSION_STARTED_KEY, String(value))
  }
}
