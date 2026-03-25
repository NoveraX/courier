import type { Theme, TimelineFilters, Settings } from "./types"

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
  theme: "dark",
  density: "comfortable",
  maxRequests: 2000,
  preserveLog: false,
  ignorePatterns: [],
  timestampFormat: "relative",
  jsonIndent: 2,
  showRequestPreview: true,
  toastOnError: true,
  toastOnSlowRequest: true,
  slowRequestThreshold: 500,
  toastOnFileChange: true,
  autoReconnect: true,
  reconnectDelay: 1000,
  defaultExportFormat: "har",
  apisValidation: "zod",
  apisGroupBy: "tag",
  apisGenerateTypes: true,
  apisGenerateSchemas: true,
  apisIncludeComments: true,
  apisClient: "direct",
}

// ── Safe localStorage reads (v2 prefix to avoid conflicts) ──────────────────

export const THEME_STORAGE_KEY = "nexus-studio-v2-theme"
export const SETTINGS_STORAGE_KEY = "nexus-studio-v2-settings"
export const SESSION_STARTED_KEY = "nexus-studio-v2-session-started"

const VALID_THEMES: ReadonlySet<string> = new Set<Theme>(["dark", "light", "system"])
export function loadTheme(): Theme {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return raw && VALID_THEMES.has(raw) ? (raw as Theme) : "dark"
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
