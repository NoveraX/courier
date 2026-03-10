import { create } from "zustand";

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
  | "proxy:respond";

export interface DevToolsEvent {
  id: string;
  type: EventType;
  timestamp: number;
  sessionId: string;
}

export interface RequestTiming {
  total: number;
  middleware: number;
  fetch: number;
  validation: number;
}

// ── Request model (aggregated from events) ─────────────────────────────────

export interface RequestEntry {
  id: string;
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
  mode: "direct" | "proxy";
  status: "pending" | "success" | "error";
  statusCode?: number;
  timing?: RequestTiming;
  data?: unknown;
  headers?: Record<string, string>;
  error?: { type: string; status?: number; message: string };
  middlewareCount: number;
  hasValidation: { variables: boolean; response: boolean };
  startedAt: number;
}

export interface SessionInfo {
  sessionId: string;
  framework: string;
  nexusVersion: string;
  sources: Record<string, unknown>;
  connectedAt: number;
}

// ── Store ──────────────────────────────────────────────────────────────────

interface DevToolsState {
  connected: boolean;
  sessions: SessionInfo[];
  requests: RequestEntry[];
  selectedRequestId: string | null;
  paused: boolean;

  setConnected: (connected: boolean) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionInfo) => void;
  removeSession: (sessionId: string) => void;
  selectRequest: (id: string | null) => void;
  togglePaused: () => void;
  clearRequests: () => void;
  handleEvent: (event: DevToolsEvent & Record<string, unknown>) => void;
}

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  connected: false,
  sessions: [],
  requests: [],
  selectedRequestId: null,
  paused: false,

  setConnected: (connected) => set({ connected }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
  removeSession: (sessionId) =>
    set((s) => ({ sessions: s.sessions.filter((ss) => ss.sessionId !== sessionId) })),
  selectRequest: (id) => set({ selectedRequestId: id }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  clearRequests: () => set({ requests: [], selectedRequestId: null }),

  handleEvent: (event) => {
    if (get().paused) return;

    set((state) => {
      switch (event.type) {
        case "request:start": {
          const entry: RequestEntry = {
            id: event.id as string,
            source: event.source as string,
            group: event.group as string | undefined,
            method: event.method as string,
            variables: event.variables,
            mode: event.mode as "direct" | "proxy",
            status: "pending",
            middlewareCount: event.middlewareCount as number,
            hasValidation: event.hasValidation as { variables: boolean; response: boolean },
            startedAt: event.timestamp as number,
          };
          return { requests: [entry, ...state.requests] };
        }

        case "request:end": {
          const requestId = event.requestId as string;
          return {
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: "success" as const,
                    statusCode: event.status as number,
                    timing: event.timing as RequestTiming,
                    data: event.data,
                    headers: event.headers as Record<string, string>,
                  }
                : r,
            ),
          };
        }

        case "request:error": {
          const requestId = event.requestId as string;
          return {
            requests: state.requests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status: "error" as const,
                    error: event.error as { type: string; status?: number; message: string },
                    statusCode: (event.error as { status?: number })?.status,
                  }
                : r,
            ),
          };
        }

        default:
          return state;
      }
    });
  },
}));
