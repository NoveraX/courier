import type { RequestStatus, RequestTiming } from "./types"

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

// ── Connection state ────────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting"

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
export type CodegenGroupBy = "tag" | "path" | "single"
export type CodegenClient = "direct" | "proxy" | "both" | "none"

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

  // Codegen defaults
  codegenValidation: ValidationLib
  codegenGroupBy: CodegenGroupBy
  codegenGenerateTypes: boolean
  codegenGenerateSchemas: boolean
  codegenIncludeComments: boolean
  codegenClient: CodegenClient
}

// ── Toast ───────────────────────────────────────────────────────────────────

export interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
}
