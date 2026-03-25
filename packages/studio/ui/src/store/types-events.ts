// ── Event types (mirrored from studio-core) ──────────────────────────────

export type EventType =
  | "connection:init"
  | "connection:sources"
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
  | "proxy:client-timing"
  | "cache:hit"
  | "cache:miss"
  | "cache:store"
  | "cache:invalidate"
  | "dedup:abort"
  | "dedup:reuse"
  | "upload:progress"
  | "upload:complete"

export interface StudioEvent {
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

// ── Middleware event model ─────────────────────────────────────────────────

export interface MiddlewareEntry {
  requestId: string
  name: string
  index: number
  totalCount?: number
  startedAt: number
  duration?: number
  status: "running" | "completed" | "error"
  error?: string
  /** Declared phase: "before" | "after" | "wrap" */
  phase?: string
  /** Time spent before calling next() (ms) */
  beforeDuration?: number
  /** Time spent after next() returned (ms) */
  afterDuration?: number
  /** Header names added by this middleware */
  headersAdded?: string[]
}
