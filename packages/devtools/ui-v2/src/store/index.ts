import { create } from "zustand"

import type { DevToolsState } from "./store-types"
import { loadSettings } from "./constants"
import { applyTheme } from "./theme"
import { applyDensity } from "./density"
import { createActions } from "./actions"
import { createInitialState } from "./initial-state"

// Re-export types consumers need
export type {
  EventType,
  DevToolsEvent,
  RequestTiming,
  ProxyTiming,
  ValidationIssue,
  MiddlewareEntry,
} from "./types-events"

export type {
  RequestStatus,
  RequestEntry,
} from "./types-request"

export type {
  Theme,
  ConnectionStatus,
  Catalog,
  CatalogEndpoint,
  CatalogGroup,
  CatalogEntry,
  CatalogMeta,
  CatalogSnapshot,
  EndpointInfo,
  GroupInfo,
  SourceInfo,
  SourceMap,
  SessionInfo,
  PlaygroundHistoryEntry,
  TimelineFilters,
  GraphLayout,
  ListSortKey,
  ListSortDir,
  WaterfallSortField,
  WaterfallGroupBy,
  CompareTab,
  AuditSeverityFilter,
  TimestampFormat,
  JsonIndent,
  ValidationLib,
  ApisGroupBy,
  ApisClient,
  ExportFormat,
  DensityMode,
  Settings,
} from "./types-ui"

export type { DevToolsState } from "./store-types"
export { EMPTY_FILTERS, PLAYGROUND_MAX_HISTORY, MAX_REQUESTS, DEFAULT_SETTINGS } from "./constants"

// ── Initialize appearance from persisted settings ────────────────────────────

const savedSettings = loadSettings()
applyTheme(savedSettings.theme)
applyDensity(savedSettings.density)

// ── Store ───────────────────────────────────────────────────────────────────

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  ...createInitialState(savedSettings.theme),
  ...createActions(set, get),
}))
