import type { DevToolsEvent } from "./types";

// ── Request Events ─────────────────────────────────────────────────────────────

export interface RequestStartEvent extends DevToolsEvent {
  type: "request:start";
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
  mode: "direct" | "proxy";
  middlewareCount: number;
  hasValidation: { variables: boolean; response: boolean };
}

export interface RequestEndEvent extends DevToolsEvent {
  type: "request:end";
  requestId: string;
  status: number;
  data: unknown;
  size: number;
  headers: Record<string, string>;
  requestHeaders: Record<string, string>;
  timing: RequestTiming;
  proxyTiming?: ProxyTiming;
}

export interface ProxyTiming {
  clientToProxy: number;
  proxyToBackend: number;
  backendToProxy: number;
  proxyToClient: number;
}

export interface RequestTiming {
  total: number;
  middleware: number;
  fetch: number;
  validation: number;
}

export interface RequestErrorEvent extends DevToolsEvent {
  type: "request:error";
  requestId: string;
  error: {
    type: "http" | "validation" | "network" | "unknown";
    status?: number;
    message: string;
  };
}

export interface ProxyClientTimingEvent extends DevToolsEvent {
  type: "proxy:client-timing";
  requestId: string;
  networkLatency: number;
  download: number;
  totalRoundTrip: number;
}

export interface RequestAbortEvent extends DevToolsEvent {
  type: "request:abort";
  requestId: string;
  reason: "deduplication" | "manual" | "timeout";
}
