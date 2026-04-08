import type { ProxyPath } from "@noverax/nexus"

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
  /** Transport mode — only present for SSE/WS endpoints */
  transport?: "sse" | "ws"
  /** True when WS channel has a receive schema (bidirectional) */
  hasReceiveSchema?: boolean
}

export interface CatalogGroup {
  prefix: string
  endpoints: Record<string, CatalogEndpoint>
}

export interface CatalogEntry {
  baseURL: string
  /**
   * The user-app's own HTTP origin (e.g. `http://localhost:3000`) declared
   * via `instrumentServer({ appOrigin })`. Used by the Playground to
   * resolve relative `proxyPath` values into full clickable URLs. Omitted
   * when the connecting process never declared one (e.g. browser-only
   * `connectStudio` flow).
   */
  appOrigin?: string
  /**
   * Per-transport proxy endpoint configuration carried from the source's
   * `defineApi({ proxyPath })`. Used by the Playground to display the
   * configured proxy URL as read-only metadata. Omitted when the source
   * has no `proxyPath` configured.
   */
  proxyPath?: ProxyPath
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
  /** Transport used — undefined = HTTP */
  transport?: "sse" | "ws"
  /** Streaming lifecycle state */
  streamStatus?: "connecting" | "streaming" | "complete" | "error"
  /** Server-assigned requestId for stream tracking (maps to RequestEntry.id) */
  serverRequestId?: string
  /** Total event count (synced from RequestEntry) */
  streamEventCount?: number
  /** Total bytes received (synced from RequestEntry) */
  streamTotalBytes?: number
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

// ── Waterfall state ─────────────────────────────────────────────────────────

export type WaterfallSortField = "startTime" | "duration" | "size"
export type WaterfallGroupBy = "none" | "source" | "group"

// ── Settings ────────────────────────────────────────────────────────────────

export type TimestampFormat = "relative" | "absolute"
export type JsonIndent = 2 | 4
export type ValidationLib = "zod" | "valibot" | "arktype" | "none"
export type ApisGroupBy = "tag" | "path" | "single"
export type ApisClient = "direct" | "proxy" | "both" | "none"
export type ExportFormat = "har" | "json" | "postman"
export type DensityMode = "comfortable" | "compact"

export interface Settings {
  // Appearance
  theme: Theme
  density: DensityMode

  // Recording
  maxRequests: number
  preserveLog: boolean
  ignorePatterns: string[]

  // Display
  timestampFormat: TimestampFormat
  jsonIndent: JsonIndent
  showRequestPreview: boolean

  // Notifications
  toastOnError: boolean
  toastOnSlowRequest: boolean
  slowRequestThreshold: number
  toastOnFileChange: boolean

  // Connection
  autoReconnect: boolean
  reconnectDelay: number

  // Export
  defaultExportFormat: ExportFormat

  // Apis defaults
  apisValidation: ValidationLib
  apisGroupBy: ApisGroupBy
  apisGenerateTypes: boolean
  apisGenerateSchemas: boolean
  apisIncludeComments: boolean
  apisClient: ApisClient
}
