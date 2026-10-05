import { browserStorage } from "@/lib/browser-storage";

import { storedSettings } from "./stored-settings";
import type { Settings, TimelineFilters } from "./types";

export const PLAYGROUND_MAX_HISTORY = 50;

/** Maximum number of requests kept in memory */
export const MAX_REQUESTS = 2000;

export const EMPTY_FILTERS: TimelineFilters = {
  search: "",
  status: [],
  mode: [],
  type: [],
  httpMethod: [],
  source: [],
  group: [],
  minDuration: null,
};

// ── Default settings ────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  maxRequests: 2000,
  preserveLog: false,
  ignorePatterns: [],
  timestampFormat: "relative",
  jsonIndent: 2,
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
};

// ── Stored settings (v2 prefix to avoid conflicts) ──────────────────────────

export const SETTINGS_STORAGE_KEY = "courier-studio-v2-settings";

export function loadSettings(): Settings {
  const raw = browserStorage.read(SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return storedSettings(JSON.parse(raw), DEFAULT_SETTINGS);
  } catch (error) {
    console.warn("Studio's stored settings are not JSON, so the defaults apply", error);
    return DEFAULT_SETTINGS;
  }
}

/* A browser that refuses storage keeps the settings for this page only. */
export function saveSettings(settings: Settings): void {
  browserStorage.write(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
