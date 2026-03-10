import { create } from "zustand"

// ── Tabs ────────────────────────────────────────────────────────────────────

export type Tab =
  | "timeline"
  | "waterfall"
  | "middleware"
  | "analytics"
  | "explorer"
  | "playground"
  | "audit"
  | "codegen"
  | "compare"
  | "settings"

// ── Theme ───────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light" | "system"

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.removeAttribute("data-theme")
    if (!prefersDark) root.setAttribute("data-theme", "light")
  } else if (theme === "light") {
    root.setAttribute("data-theme", "light")
  } else {
    root.removeAttribute("data-theme")
  }
}

// ── Event types (mirrored from devtools-core) ──────────────────────────────

export type EventType =
  | "connection:init"
  | "request:start"
  | "request:end"
  | "request:error"
  | "http:fetch:start"
  | "http:fetch:end"
  | "middleware:enter"
  | "middleware:exit"
  | "middleware:error"
  | "validation:start"
  | "validation:pass"
  | "validation:fail"
  | "proxy:receive"
  | "proxy:respond"

export interface DevToolsEvent {
  id: string
  type: EventType
  timestamp: number
  sessionId: string
}

export interface RequestTiming {
  total: number
  middleware: number
  fetch: number
  validation: number
}

export interface ProxyTiming {
  clientToProxy: number
  proxyToBackend: number
  backendToProxy: number
  proxyToClient: number
}

export interface ValidationIssue {
  path: string
  message: string
  expected?: string
  received?: string
}

// ── Request model (aggregated from events) ─────────────────────────────────

export type RequestStatus =
  | "pending"
  | "success"
  | "error"
  | "aborted"
  | "validation_error"

export interface RequestEntry {
  id: string
  source: string
  group: string | undefined
  method: string
  httpMethod?: string
  variables: unknown
  validatedVariables?: unknown
  sentBody?: unknown
  mode: "direct" | "proxy"
  type?: "query" | "mutation"
  status: RequestStatus
  statusCode?: number
  timing?: RequestTiming
  proxyTiming?: ProxyTiming
  size?: number
  data?: unknown
  rawResponse?: string
  validatedResponse?: unknown
  requestHeaders?: Record<string, string>
  headers?: Record<string, string>
  middlewareHeaders?: Record<string, string[]>
  error?: {
    type: string
    status?: number
    message: string
    validationIssues?: ValidationIssue[]
  }
  middlewareCount: number
  hasValidation: { variables: boolean; response: boolean }
  startedAt: number
  url?: string
  pinned?: boolean
}

// ── Source map (from connection:init / connection:sources) ───────────────────

export interface EndpointInfo {
  type: "query" | "mutation"
  hasVariablesSchema: boolean
  hasResponseSchema: boolean
  middleware: string[]
}

export interface GroupInfo {
  prefix: string
  endpoints: Record<string, EndpointInfo>
}

export interface SourceInfo {
  baseURL: string
  groups: Record<string, GroupInfo>
}

export type SourceMap = Record<string, SourceInfo>

export interface SessionInfo {
  sessionId: string
  framework: string
  nexusVersion: string
  sources: SourceMap
  connectedAt: number
}

// ── Playground model ─────────────────────────────────────────────────────────

export interface PlaygroundHistoryEntry {
  id: string
  source: string
  group: string
  method: string
  variables: string
  headers: string
  mode: "direct" | "proxy"
  timestamp: number
  status: "pending" | "success" | "error"
  statusCode?: number
  duration?: number
  response?: unknown
  responseHeaders?: Record<string, string>
  timing?: RequestTiming
}

export const PLAYGROUND_MAX_HISTORY = 50

/** Maximum number of requests kept in memory */
export const MAX_REQUESTS = 2000

// ── Timeline filters ────────────────────────────────────────────────────────

export interface TimelineFilters {
  search: string
  status: RequestStatus[]
  mode: ("direct" | "proxy")[]
  type: ("query" | "mutation")[]
  httpMethod: string[]
  source: string[]
  group: string[]
  minDuration: number | null
}

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

// ── Store ──────────────────────────────────────────────────────────────────

// ── Explorer state ──────────────────────────────────────────────────────────

export type ExplorerView = "graph" | "pipeline" | "list"
export type GraphLayout = "LR" | "TB"
export type ListSortKey = "source" | "group" | "method" | "type" | "middleware" | "schemas"
export type ListSortDir = "asc" | "desc"

// ── Waterfall state ─────────────────────────────────────────────────────────

export type WaterfallSortField = "startTime" | "duration" | "size"
export type WaterfallGroupBy = "none" | "source" | "group"

// ── Compare state ───────────────────────────────────────────────────────────

export type CompareTab = "payload" | "response" | "headers" | "timing"

// ── Audit state ─────────────────────────────────────────────────────────────

export type AuditSeverityFilter = "error" | "warning" | "hint" | "pass" | "all"

// ── Toast ───────────────────────────────────────────────────────────────────

export interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
}

interface DevToolsState {
  // UI
  activeTab: Tab
  theme: Theme
  toasts: Toast[]

  // Connection
  connected: boolean
  sessions: SessionInfo[]

  // Requests
  requests: RequestEntry[]
  selectedRequestId: string | null
  paused: boolean
  preserveLog: boolean

  // Timeline filters (persisted across tab switches)
  timelineFilters: TimelineFilters
  timelineShowFilters: boolean

  // Explorer
  explorerView: ExplorerView
  explorerSelectedEndpoint: { source: string; group: string; method: string } | null
  graphLayout: GraphLayout
  showSchemas: boolean
  listSearch: string
  listSortKey: ListSortKey
  listSortDir: ListSortDir

  // Waterfall
  waterfallSortBy: WaterfallSortField
  waterfallGroupBy: WaterfallGroupBy
  waterfallZoom: number

  // Middleware
  middlewareSelectedId: string | null
  middlewareShowStats: boolean

  // Compare
  compareLeftId: string | null
  compareRightId: string | null
  compareActiveTab: CompareTab
  comparePickerSide: "left" | "right" | null

  // Audit
  auditFilter: AuditSeverityFilter
  auditExpandedIds: Set<string>

  // Actions — UI
  setActiveTab: (tab: Tab) => void
  setTheme: (theme: Theme) => void
  showToast: (message: string, type?: Toast["type"]) => void
  dismissToast: (id: string) => void

  // Actions — Connection
  setConnected: (connected: boolean) => void
  setSessions: (sessions: SessionInfo[]) => void
  addSession: (session: SessionInfo) => void
  removeSession: (sessionId: string) => void

  // Actions — Requests
  selectRequest: (id: string | null) => void
  togglePaused: () => void
  togglePreserveLog: () => void
  clearRequests: () => void
  togglePin: (id: string) => void
  handleEvent: (event: DevToolsEvent & Record<string, unknown>) => void

  // Actions — Timeline filters
  setTimelineFilters: (f: TimelineFilters) => void
  setTimelineShowFilters: (v: boolean) => void

  // Playground
  playgroundHistory: PlaygroundHistoryEntry[]
  playgroundActiveResponse: PlaygroundHistoryEntry | null

  // Actions — Explorer
  setExplorerView: (view: ExplorerView) => void
  setExplorerSelectedEndpoint: (ep: { source: string; group: string; method: string } | null) => void
  setGraphLayout: (layout: GraphLayout) => void
  setShowSchemas: (show: boolean) => void
  setListSearch: (search: string) => void
  setListSortKey: (key: ListSortKey) => void
  setListSortDir: (dir: ListSortDir) => void

  // Actions — Waterfall
  setWaterfallSortBy: (sort: WaterfallSortField) => void
  setWaterfallGroupBy: (group: WaterfallGroupBy) => void
  setWaterfallZoom: (zoom: number) => void

  // Actions — Middleware
  setMiddlewareSelectedId: (id: string | null) => void
  setMiddlewareShowStats: (show: boolean) => void

  // Actions — Compare
  setCompareLeftId: (id: string | null) => void
  setCompareRightId: (id: string | null) => void
  setCompareActiveTab: (tab: CompareTab) => void
  setComparePickerSide: (side: "left" | "right" | null) => void
  clearCompareSelection: () => void

  // Actions — Audit
  setAuditFilter: (filter: AuditSeverityFilter) => void
  toggleAuditExpanded: (id: string) => void

  // Actions — Playground
  addPlaygroundEntry: (entry: PlaygroundHistoryEntry) => void
  updatePlaygroundEntry: (id: string, patch: Partial<PlaygroundHistoryEntry>) => void
  setPlaygroundActiveResponse: (entry: PlaygroundHistoryEntry | null) => void
  clearPlaygroundHistory: () => void
}

const savedTheme = (localStorage.getItem("nexus-devtools-theme") as Theme) || "dark"
applyTheme(savedTheme)

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  // UI
  activeTab: "timeline",
  theme: savedTheme,
  toasts: [],

  // Connection
  connected: false,
  sessions: [],

  // Requests
  requests: [],
  selectedRequestId: null,
  paused: false,
  preserveLog: false,

  // Timeline filters
  timelineFilters: EMPTY_FILTERS,
  timelineShowFilters: false,

  // Explorer
  explorerView: "graph",
  explorerSelectedEndpoint: null,
  graphLayout: "LR",
  showSchemas: true,
  listSearch: "",
  listSortKey: "source",
  listSortDir: "asc",

  // Waterfall
  waterfallSortBy: "startTime",
  waterfallGroupBy: "none",
  waterfallZoom: 1,

  // Middleware
  middlewareSelectedId: null,
  middlewareShowStats: false,

  // Compare
  compareLeftId: null,
  compareRightId: null,
  compareActiveTab: "response",
  comparePickerSide: null,

  // Actions — UI
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => {
    localStorage.setItem("nexus-devtools-theme", theme)
    applyTheme(theme)
    set({ theme })
  },
  showToast: (message, type = "info") => {
    const id = `toast_${Date.now().toString(36)}`
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 3000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Actions — Connection
  setConnected: (connected) => set({ connected }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
  removeSession: (sessionId) =>
    set((s) => ({ sessions: s.sessions.filter((ss) => ss.sessionId !== sessionId) })),

  // Actions — Requests
  selectRequest: (id) => set({ selectedRequestId: id }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  togglePreserveLog: () => set((s) => ({ preserveLog: !s.preserveLog })),
  clearRequests: () =>
    set((s) => {
      if (s.preserveLog) {
        const pinned = s.requests.filter((r) => r.pinned)
        return { requests: pinned, selectedRequestId: null }
      }
      return { requests: [], selectedRequestId: null }
    }),
  togglePin: (id) =>
    set((s) => ({
      requests: s.requests.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
    })),

  // Actions — Timeline filters
  setTimelineFilters: (f) => set({ timelineFilters: f }),
  setTimelineShowFilters: (v) => set({ timelineShowFilters: v }),

  // Playground
  playgroundHistory: [],
  playgroundActiveResponse: null,

  // Audit
  auditFilter: "all",
  auditExpandedIds: new Set<string>(),

  // Actions — Explorer
  setExplorerView: (view) => set({ explorerView: view }),
  setExplorerSelectedEndpoint: (ep) => set({ explorerSelectedEndpoint: ep }),
  setGraphLayout: (layout) => set({ graphLayout: layout }),
  setShowSchemas: (show) => set({ showSchemas: show }),
  setListSearch: (search) => set({ listSearch: search }),
  setListSortKey: (key) => set({ listSortKey: key }),
  setListSortDir: (dir) => set({ listSortDir: dir }),

  // Actions — Waterfall
  setWaterfallSortBy: (sort) => set({ waterfallSortBy: sort }),
  setWaterfallGroupBy: (group) => set({ waterfallGroupBy: group }),
  setWaterfallZoom: (zoom) => set({ waterfallZoom: zoom }),

  // Actions — Middleware
  setMiddlewareSelectedId: (id) => set({ middlewareSelectedId: id }),
  setMiddlewareShowStats: (show) => set({ middlewareShowStats: show }),

  // Actions — Compare
  setCompareLeftId: (id) => set({ compareLeftId: id }),
  setCompareRightId: (id) => set({ compareRightId: id }),
  setCompareActiveTab: (tab) => set({ compareActiveTab: tab }),
  setComparePickerSide: (side) => set({ comparePickerSide: side }),
  clearCompareSelection: () => set({ compareLeftId: null, compareRightId: null, comparePickerSide: null }),

  // Actions — Audit
  setAuditFilter: (filter) => set({ auditFilter: filter }),
  toggleAuditExpanded: (id) =>
    set((s) => {
      const next = new Set(s.auditExpandedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { auditExpandedIds: next }
    }),

  // Actions — Playground
  addPlaygroundEntry: (entry) =>
    set((s) => ({
      playgroundHistory: [entry, ...s.playgroundHistory].slice(0, PLAYGROUND_MAX_HISTORY),
      playgroundActiveResponse: entry,
    })),
  updatePlaygroundEntry: (id, patch) =>
    set((s) => {
      const updated = s.playgroundHistory.map((h) => (h.id === id ? { ...h, ...patch } : h))
      const active =
        s.playgroundActiveResponse?.id === id
          ? { ...s.playgroundActiveResponse, ...patch }
          : s.playgroundActiveResponse
      return { playgroundHistory: updated, playgroundActiveResponse: active }
    }),
  setPlaygroundActiveResponse: (entry) => set({ playgroundActiveResponse: entry }),
  clearPlaygroundHistory: () => set({ playgroundHistory: [], playgroundActiveResponse: null }),

  handleEvent: (event) => {
    if (get().paused) return

    set((state) => {
      switch (event.type) {
        case "request:start": {
          const entry: RequestEntry = {
            id: event.id as string,
            source: event.source as string,
            group: event.group as string | undefined,
            method: event.method as string,
            httpMethod: (event.httpMethod as string | undefined) ?? undefined,
            variables: event.variables,
            mode: (event.mode as "direct" | "proxy") ?? "direct",
            type: (event.endpointType as "query" | "mutation" | undefined) ?? undefined,
            status: "pending",
            middlewareCount: (event.middlewareCount as number) ?? 0,
            hasValidation:
              (event.hasValidation as { variables: boolean; response: boolean }) ?? {
                variables: false,
                response: false,
              },
            startedAt: event.timestamp as number,
            url: (event.url as string | undefined) ?? undefined,
          }
          const updated = [entry, ...state.requests]
          return { requests: updated.length > MAX_REQUESTS ? updated.slice(0, MAX_REQUESTS) : updated }
        }

        case "request:end": {
          const requestId = event.requestId as string
          return {
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: "success" as const,
                    statusCode: event.status as number,
                    timing: event.timing as RequestTiming,
                    proxyTiming: (event.proxyTiming as ProxyTiming | undefined) ?? undefined,
                    size: (event.size as number | undefined) ?? undefined,
                    data: event.data,
                    rawResponse: (event.rawResponse as string | undefined) ?? undefined,
                    validatedResponse:
                      (event.validatedResponse as unknown | undefined) ?? undefined,
                    validatedVariables:
                      (event.validatedVariables as unknown | undefined) ?? undefined,
                    sentBody: (event.sentBody as unknown | undefined) ?? undefined,
                    requestHeaders:
                      (event.requestHeaders as Record<string, string> | undefined) ?? undefined,
                    headers: event.headers as Record<string, string>,
                    middlewareHeaders:
                      (event.middlewareHeaders as Record<string, string[]> | undefined) ??
                      undefined,
                  }
                : r,
            ),
          }
        }

        case "request:error": {
          const requestId = event.requestId as string
          const rawError = event.error as Record<string, unknown> | undefined
          const errorData = rawError
            ? {
                type: (rawError.type as string) ?? "Error",
                status: rawError.status as number | undefined,
                message: (rawError.message as string) ?? "Unknown error",
                validationIssues:
                  (rawError.validationIssues as ValidationIssue[] | undefined) ?? undefined,
              }
            : undefined
          const errorStatus: RequestStatus =
            errorData?.type === "ValidationError"
              ? "validation_error"
              : errorData?.type === "AbortError"
                ? "aborted"
                : "error"
          return {
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: errorStatus,
                    error: errorData,
                    statusCode: errorData?.status ?? r.statusCode,
                    timing: (event.timing as RequestTiming | undefined) ?? r.timing,
                  }
                : r,
            ),
          }
        }

        default:
          return state
      }
    })
  },
}))
