import type { MiddlewareEntry, ProxyTiming, RequestTiming, ValidationIssue } from "./types-events";

// ── Request model (aggregated from events) ─────────────────────────────────

export type RequestStatus = "pending" | "success" | "error" | "aborted" | "validation_error";

/** What a request validates against its endpoint's schemas. */
export type ValidationTarget = "variables" | "response";

export interface RequestEntry {
  id: string;
  source: string;
  group: string | undefined;
  method: string;
  httpMethod?: string | undefined;
  variables: unknown;
  validatedVariables?: unknown;
  sentBody?: unknown;
  mode: "direct" | "proxy";
  type?: "query" | "mutation" | undefined;
  status: RequestStatus;
  statusCode?: number | undefined;
  timing?: RequestTiming | undefined;
  proxyTiming?: ProxyTiming | undefined;
  size?: number | undefined;
  data?: unknown;
  rawResponse?: string | undefined;
  validatedResponse?: unknown;
  requestHeaders?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
  middlewareHeaders?: Record<string, string[]> | undefined;
  error?:
    | {
        type: string;
        status?: number | undefined;
        message: string;
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
  pinned?: boolean | undefined;
  sessionId: string;
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
