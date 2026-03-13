import { create } from "zustand"

import type { DevToolsState } from "./store-types"
import { loadTheme } from "./constants"
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
  Theme,
  ConnectionStatus,
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
  Settings,
  Toast,
} from "./types-ui"

export type { DevToolsState } from "./store-types"
export { EMPTY_FILTERS, PLAYGROUND_MAX_HISTORY, MAX_REQUESTS, DEFAULT_SETTINGS } from "./constants"

// ── Initialize theme ────────────────────────────────────────────────────────

const savedTheme = loadTheme()
applyTheme(savedTheme)

// ── Store ───────────────────────────────────────────────────────────────────

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  ...createInitialState(savedTheme),
  ...createActions(set, get),
}))
