import type { StudioEvent } from "./types";

// ── Request Events ─────────────────────────────────────────────────────────────

export interface RequestStartEvent extends StudioEvent {
  type: "request:start";
  source: string;
  group: string | undefined;
  method: string;
  variables: unknown;
  mode: "direct" | "proxy";
  middlewareCount: number;
  hasValidation: { variables: boolean; response: boolean };
  /** The endpoint's HTTP verb (`"GET"`, `"DELETE"`), when it declares one. */
  httpMethod?: string;
  /** Whether the endpoint reads or writes. */
  endpointType?: "query" | "mutation";
}

export interface RequestEndEvent extends StudioEvent {
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

export interface RequestErrorEvent extends StudioEvent {
  type: "request:error";
  requestId: string;
  error: {
    type: "http" | "validation" | "network" | "timeout" | "aborted" | "unknown";
    /** The upstream's status, when it answered. */
    status?: number;
    message: string;
  };
  /** The status the caller received, when it received one — a proxy's own 422 or 502. */
  status?: number;
  /** The upstream's response headers, when it answered. */
  headers?: Record<string, string>;
  /** The upstream's error body, when it answered. */
  data?: unknown;
  /** How long the request took before it failed. */
  timing?: RequestTiming;
}

export interface ProxyClientTimingEvent extends StudioEvent {
  type: "proxy:client-timing";
  requestId: string;
  networkLatency: number;
  download: number;
  totalRoundTrip: number;
}

export interface RequestAbortEvent extends StudioEvent {
  type: "request:abort";
  requestId: string;
  reason: "deduplication" | "manual" | "timeout";
}
