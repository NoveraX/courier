import { create } from "zustand";

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
  | "settings";

// ── Theme ───────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.removeAttribute("data-theme");
    if (!prefersDark) root.setAttribute("data-theme", "light");
  } else if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
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
  // UI
  activeTab: Tab;
  theme: Theme;

  // Connection
  connected: boolean;
  sessions: SessionInfo[];

  // Requests
  requests: RequestEntry[];
  selectedRequestId: string | null;
  paused: boolean;

  // Actions — UI
  setActiveTab: (tab: Tab) => void;
  setTheme: (theme: Theme) => void;

  // Actions — Connection
  setConnected: (connected: boolean) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionInfo) => void;
  removeSession: (sessionId: string) => void;

  // Actions — Requests
  selectRequest: (id: string | null) => void;
  togglePaused: () => void;
  clearRequests: () => void;
  handleEvent: (event: DevToolsEvent & Record<string, unknown>) => void;
}

const savedTheme = (localStorage.getItem("nexus-devtools-theme") as Theme) || "dark";
applyTheme(savedTheme);

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

  // Actions — UI
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => {
    localStorage.setItem("nexus-devtools-theme", theme);
    applyTheme(theme);
    set({ theme });
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
