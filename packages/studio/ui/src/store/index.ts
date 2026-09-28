import { create } from "zustand"

import type { StudioState } from "./store-types"
import { loadSettings } from "./constants"
import { applyTheme } from "./theme"
import { applyDensity } from "./density"
import { createActions } from "./actions"
import { createInitialState } from "./initial-state"
import { keepPlaygroundHistory } from "./keep-playground-history"

// Re-export types consumers need
export type {
  EventType,
  StudioEvent,
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
  EndpointInfo,
  GroupInfo,
  SourceInfo,
  SourceMap,
  BindingSnapshot,
  BindingStatusRow,
  BindingTransport,
  BindingStatusKind,
  BindingErrorPayload,
  PlaygroundHistoryEntry,
  TimelineFilters,
  WaterfallSortField,
  WaterfallGroupBy,
  TimestampFormat,
  JsonIndent,
  ValidationLib,
  ApisGroupBy,
  ApisClient,
  ExportFormat,
  DensityMode,
  Settings,
} from "./types-ui"

export type { StudioState } from "./store-types"
export { EMPTY_FILTERS, PLAYGROUND_MAX_HISTORY, MAX_REQUESTS, DEFAULT_SETTINGS } from "./constants"

// ── Initialize appearance from persisted settings ────────────────────────────

const savedSettings = loadSettings()
applyTheme(savedSettings.theme)
applyDensity(savedSettings.density)

// ── Store ───────────────────────────────────────────────────────────────────

export const useStudioStore = create<StudioState>((set, get) => ({
  ...createInitialState(savedSettings.theme),
  ...createActions(set, get),
}))

keepPlaygroundHistory(useStudioStore)
