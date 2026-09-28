import type { RequestTiming, ProxyTiming, ValidationIssue, MiddlewareEntry } from "./types-events"

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
  middlewareEntries: MiddlewareEntry[]
  hasValidation: { variables: boolean; response: boolean }
  startedAt: number
  url?: string
  pinned?: boolean
  sessionId: string
  /** What the cache middleware did: answered from a stored response (`age` ms old), or missed. */
  cache?: { hit: boolean; age?: number }
  // Stream (SSE/WS) fields
  transport?: "http" | "sse" | "ws"
  streamStatus?: "streaming" | "complete" | "error"
  streamEventCount?: number
  streamTotalBytes?: number
  streamDuration?: number
  /** Captured stream events with metadata (capped to last 200) */
  streamEvents?: StreamEventRecord[]
}

/** A captured stream event in the request timeline */
export interface StreamEventRecord {
  seq: number
  eventType?: string
  dataSize: number
  /** Truncated JSON preview of the event data */
  dataPreview?: string
  timestamp: number
}
