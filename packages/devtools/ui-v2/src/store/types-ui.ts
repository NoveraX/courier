import type { ProxyTiming, RequestStatus, RequestTiming } from "./types"

// ── Theme ───────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light" | "system"

// ── Connection state ────────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting"

// ── Catalog (server-authoritative merged source map) ────────────────────────

export interface CatalogEndpoint {
  type: "query" | "mutation" | undefined
  hasVariablesSchema: boolean
  hasResponseSchema: boolean
  path?: string
  httpMethod?: string
  middleware?: string[]
  /** Default variables stub from schema introspection */
  variablesStub?: Record<string, unknown>
  origin: "scan" | "runtime" | "both"
}

export interface CatalogGroup {
  prefix: string
  endpoints: Record<string, CatalogEndpoint>
}

export interface CatalogEntry {
  baseURL: string
  groups: Record<string, CatalogGroup>
}

export type Catalog = Record<string, CatalogEntry>

export interface CatalogMeta {
  scanTimestamp: number | null
  runtimeSessions: string[]
  totalEndpoints: number
}

export interface CatalogSnapshot {
  catalog: Catalog
  timestamp: number
  meta: CatalogMeta
}

// ── Legacy aliases (for gradual migration of existing views) ────────────────

export type EndpointInfo = CatalogEndpoint
export type GroupInfo = CatalogGroup
export type SourceInfo = CatalogEntry
export type SourceMap = Catalog

// ── Session (no longer carries sources — catalog is separate) ───────────────

export interface SessionInfo {
  sessionId: string
  framework: string
  nexusVersion: string
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
  proxyTiming?: ProxyTiming
  requestHeaders?: Record<string, string>
}

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

// ── Settings ────────────────────────────────────────────────────────────────

export type TimestampFormat = "relative" | "absolute"
export type JsonIndent = 2 | 4
export type ValidationLib = "zod" | "valibot" | "arktype" | "none"
export type ApisGroupBy = "tag" | "path" | "single"
export type ApisClient = "direct" | "proxy" | "both" | "none"

export interface Settings {
  // Recording
  maxRequests: number
  preserveLog: boolean

  // Display
  timestampFormat: TimestampFormat
  jsonIndent: JsonIndent
  showRequestPreview: boolean

  // Notifications
  toastOnError: boolean
  toastOnSlowRequest: boolean
  slowRequestThreshold: number

  // Connection
  autoReconnect: boolean
  reconnectDelay: number

  // Apis defaults
  apisValidation: ValidationLib
  apisGroupBy: ApisGroupBy
  apisGenerateTypes: boolean
  apisGenerateSchemas: boolean
  apisIncludeComments: boolean
  apisClient: ApisClient
}
