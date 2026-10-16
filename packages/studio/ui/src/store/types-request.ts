import type { MiddlewareEntry, ProxyTiming, RequestTiming, ValidationIssue } from "./types-events";

// ── Request model (aggregated from events) ─────────────────────────────────

export type RequestStatus = "pending" | "success" | "error" | "aborted" | "validation_error";

/** What a request validates against its endpoint's schemas. */
export type ValidationTarget = "variables" | "response";

/** The HTTP version a request went over, as a protocol's name for it. */
export type HttpVersion = "HTTP/1.0" | "HTTP/1.1" | "HTTP/2" | "HTTP/3";

/** The agent tool a call ran for, when an MCP server made it, and the client as it named itself. */
export interface RequestAgent {
  tool: string;
  access: "read" | "write" | "destructive";
  client?: string | undefined;
}

/**
 * How a call's read was answered by another call's request, without one of
 * its own: it joined the identical read already in flight (`flight`), or
 * the render it was made in had read it already (`render`).
 */
export interface SharedAnswer {
  by: "flight" | "render";
  /** The call whose request answered, when Studio measured it */
  with?: string | undefined;
}

/** Why a request got no answer, as the system said it: its code, where it gave one, and its text. */
export interface RequestFailureCause {
  code?: string | undefined;
  message: string;
}

export interface RequestEntry {
  id: string;
  source: string;
  group: string | undefined;
  method: string;
  httpMethod?: string | undefined;
  /**
   * What the request is when it is none of the API's endpoints but one the
   * session makes for a call: `"csrf-token"`, the double-submit token asked
   * for before a write. It names no endpoint to replay or to list.
   */
  purpose?: "csrf-token" | undefined;
  /** The variables, or a part of them when they were too large for their event; see `variablesCutFrom`. */
  variables: unknown;
  /** The size in bytes of the whole variables as JSON, when `variables` is a part of them. */
  variablesCutFrom?: number | undefined;
  /** How the call came: made by the app directly, through Courier's proxy, or delivered to it as a webhook. */
  mode: "direct" | "proxy" | "webhook";
  /** The agent the call ran for, when an MCP server made it; absent on the application's own calls. */
  agent?: RequestAgent | undefined;
  /** The key the call sent in its endpoint's idempotency header, the same on every attempt. */
  idempotencyKey?: string | undefined;
  /** Set when `browsersOnly` let the Playground's call through on the one-time pass Studio's runtime gave it. */
  studioPass?: true | undefined;
  type?: "query" | "mutation" | undefined;
  status: RequestStatus;
  statusCode?: number | undefined;
  timing?: RequestTiming | undefined;
  proxyTiming?: ProxyTiming | undefined;
  /** How its read was answered by another call's request, when it sent none of its own */
  shared?: SharedAnswer | undefined;
  size?: number | undefined;
  /** The answer, or a part of it when it was too large for its event; see `dataCutFrom`. */
  data?: unknown;
  /** The size in bytes of the whole answer as JSON, when `data` is a part of it. */
  dataCutFrom?: number | undefined;
  requestHeaders?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
  middlewareHeaders?: Record<string, string[]> | undefined;
  error?:
    | {
        type: string;
        status?: number | undefined;
        message: string;
        /** Why no answer came, when the runtime could tell. */
        cause?: RequestFailureCause | undefined;
        validationIssues?: ValidationIssue[] | undefined;
      }
    | undefined;
  middlewareCount: number;
  middlewareEntries: MiddlewareEntry[];
  hasValidation: { variables: boolean; response: boolean };
  /** How each validation that ran ended; a target left out was not validated */
  validated?: Partial<Record<ValidationTarget, "passed" | "failed">> | undefined;
  startedAt: number;
  url?: string | undefined;
  /** The HTTP version the request went over, when its runtime could tell. */
  httpVersion?: HttpVersion | undefined;
  pinned?: boolean | undefined;
  sessionId: string;
  /** The runtime that made a proxied call — a page, or a process calling the proxy — when it said so. */
  callerRuntimeId?: string | undefined;
  /** What the cache middleware did: answered from a stored response (`age` ms old), or missed. */
  cache?: { hit: boolean; age?: number } | undefined;
  /** How much of the request's body has been sent, while a caller watches its upload */
  upload?: UploadState | undefined;
  // Stream (SSE/WS) fields
  transport?: "http" | "sse" | "ws" | undefined;
  streamStatus?: "streaming" | "complete" | "error" | undefined;
  streamEventCount?: number | undefined;
  streamTotalBytes?: number | undefined;
  streamDuration?: number | undefined;
  /** Captured stream events with metadata (capped to last 200) */
  streamEvents?: StreamEventRecord[] | undefined;
}

/** A captured stream event in the request timeline */
export interface StreamEventRecord {
  seq: number;
  eventType?: string;
  dataSize: number;
  /** Truncated JSON preview of the event data */
  dataPreview?: string;
  timestamp: number;
}

/** An upload's progress, as the caller that sends it reports it */
export interface UploadState {
  loaded: number;
  /** 0 while the body's size is unknown */
  total: number;
  /** 0–100 */
  percentage: number;
  /** Whether the whole body has been sent */
  done: boolean;
}
