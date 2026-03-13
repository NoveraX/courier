import { create } from "zustand"

import type { DevToolsState } from "./store-types"
import { loadTheme, loadTab } from "./constants"
import { applyTheme } from "./theme"
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
  Tab,
  Theme,
  ConnectionStatus,
  EndpointInfo,
  GroupInfo,
  SourceInfo,
  SourceMap,
  SessionInfo,
  PlaygroundHistoryEntry,
  TimelineFilters,
  ExplorerView,
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
  CodegenGroupBy,
  CodegenClient,
  Settings,
  Toast,
} from "./types-ui"

export type { DevToolsState } from "./store-types"
export { EMPTY_FILTERS, PLAYGROUND_MAX_HISTORY, MAX_REQUESTS, DEFAULT_SETTINGS } from "./constants"

// ── Initialize theme ────────────────────────────────────────────────────────

const savedTheme = loadTheme()
const savedTab = loadTab()
applyTheme(savedTheme)

// ── Store ───────────────────────────────────────────────────────────────────

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  ...createInitialState(savedTheme, savedTab),
  ...createActions(set, get),
}))
