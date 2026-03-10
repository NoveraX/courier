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

export interface SessionInfo {
  sessionId: string
  framework: string
  nexusVersion: string
  sources: Record<string, unknown>
  connectedAt: number
}

// ── Store ──────────────────────────────────────────────────────────────────

interface DevToolsState {
  // UI
  activeTab: Tab
  theme: Theme

  // Connection
  connected: boolean
  sessions: SessionInfo[]

  // Requests
  requests: RequestEntry[]
  selectedRequestId: string | null
  paused: boolean
  preserveLog: boolean

  // Actions — UI
  setActiveTab: (tab: Tab) => void
  setTheme: (theme: Theme) => void

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
}

const savedTheme = (localStorage.getItem("nexus-devtools-theme") as Theme) || "dark"
applyTheme(savedTheme)

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  // UI
  activeTab: "timeline",
  theme: savedTheme,

  // Connection
  connected: false,
  sessions: [],

  // Requests
  requests: [],
  selectedRequestId: null,
  paused: false,
  preserveLog: false,

  // Actions — UI
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => {
    localStorage.setItem("nexus-devtools-theme", theme)
    applyTheme(theme)
    set({ theme })
  },

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
          return { requests: [entry, ...state.requests] }
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
