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
}
