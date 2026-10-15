import type { StudioEvent } from "./types";

// ── Request Events ─────────────────────────────────────────────────────────────

export interface RequestStartEvent extends StudioEvent {
  type: "request:start";
  source: string;
  group: string | undefined;
  method: string;
  /** The variables, or a part of them when they are too large for an event; see `variablesCutFrom`. */
  variables: unknown;
  /** The size in bytes of the whole variables as JSON, when `variables` is a part of them. */
  variablesCutFrom?: number;
  /** How the call came: made by the app directly, through Courier's proxy, or delivered to it as a webhook. */
  mode: "direct" | "proxy" | "webhook";
  middlewareCount: number;
  hasValidation: { variables: boolean; response: boolean };
  /** The endpoint's HTTP verb (`"GET"`, `"DELETE"`), when it declares one. */
  httpMethod?: string;
  /** Whether the endpoint reads or writes. */
  endpointType?: "query" | "mutation";
  /**
   * What the request is when it is none of the API's endpoints but one the
   * session makes for a call: `"csrf-token"`, the double-submit token asked
   * for before a write that found none.
   */
  purpose?: "csrf-token";
  /** The agent tool the call ran for, when an MCP server made it, and the client as it named itself. */
  agent?: RequestAgent;
  /** The key the call sends in its endpoint's idempotency header, the same on every attempt. */
  idempotencyKey?: string;
}

/** An agent's call, as Studio shows it: the tool, what it declared it does, and the client. */
export interface RequestAgent {
  tool: string;
  access: "read" | "write" | "destructive";
  client?: string;
}

/**
 * The shape of a 2xx answer as it came back, before the endpoint's response
 * schema read it: each place — `user.id`, `items[].price` — with the JSON
 * types seen there. Studio's server sets it beside the schema to follow the
 * contract's drift; it goes to no page.
 */
export interface RequestShapeEvent extends StudioEvent {
  type: "request:shape";
  requestId: string;
  shape: Readonly<Record<string, string>>;
  /** The answer was larger or deeper than a shape walks */
  cut: boolean;
}

export interface RequestEndEvent extends StudioEvent {
  type: "request:end";
  requestId: string;
  status: number;
  /** The answer, or a part of it when it is too large for an event; see `dataCutFrom`. */
  data: unknown;
  /** The size in bytes of the whole answer as JSON, when `data` is a part of it. */
  dataCutFrom?: number;
  size: number;
  headers: Record<string, string>;
  requestHeaders: Record<string, string>;
  timing: RequestTiming;
  proxyTiming?: ProxyTiming;
  /** How the call's read was answered by another call's request, when it was */
  shared?: SharedAnswer;
}

/**
 * How a read got its answer without a request of its own: it joined the
 * identical read already in flight (`flight`), or the render it was made
 * in had read the same thing already (`render`). `with` is the Studio id
 * of the call whose request answered, when that call was measured.
 */
export interface SharedAnswer {
  by: "flight" | "render";
  with?: string;
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
  /** The headers the call came with, when the runtime has them: a refused webhook delivery's. */
  requestHeaders?: Record<string, string>;
  /** The upstream's error body, when it answered: a part of it when it is too large for an event. */
  data?: unknown;
  /** The size in bytes of the whole error body as JSON, when `data` is a part of it. */
  dataCutFrom?: number;
  /** How large the upstream's error body was, when it answered. */
  size?: number;
  /** How long the request took before it failed. */
  timing?: RequestTiming;
  /** How a proxied call's time split, as for one that succeeded. */
  proxyTiming?: ProxyTiming;
  /** How the call's read was answered by another call's request, when it was */
  shared?: SharedAnswer;
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
  reason: "superseded" | "manual" | "timeout";
}
