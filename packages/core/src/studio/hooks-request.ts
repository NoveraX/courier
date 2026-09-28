/**
 * How a request failed: an upstream's error answer, a refused schema, a
 * request that got no answer, one that ran out of time, one its caller
 * cancelled, or the server's own failure.
 */
export type RequestFailureKind =
  | "http"
  | "validation"
  | "network"
  | "timeout"
  | "aborted"
  | "unknown";

/**
 * Studio hook definitions for the request lifecycle.
 *
 * Covers the core request flow + middleware + validation + raw HTTP fetch
 * timing — every event a single direct request can produce. All hooks
 * remain optional; consumers always merge them into the composite
 * `StudioHooks` interface in `hooks.ts`.
 */

export interface RequestLifecycleHooks {
  onRequestStart?: (event: {
    id: string;
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
    timestamp: number;
  }) => void;

  onRequestEnd?: (event: {
    id: string;
    status: number;
    data: unknown;
    size: number;
    headers: Record<string, string>;
    requestHeaders: Record<string, string>;
    timing: {
      total: number;
      middleware: number;
      fetch: number;
      validation: number;
    };
    proxyTiming?: {
      clientToProxy: number;
      proxyToBackend: number;
      backendToProxy: number;
      proxyToClient: number;
    };
    timestamp: number;
  }) => void;

  onRequestError?: (event: {
    id: string;
    error: {
      type: RequestFailureKind;
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
    timing?: {
      total: number;
      middleware: number;
      fetch: number;
      validation: number;
    };
    timestamp: number;
  }) => void;

  onRequestAbort?: (event: {
    id: string;
    reason: "deduplication" | "manual" | "timeout";
    timestamp: number;
  }) => void;
}

/** Middleware enter/exit/error instrumentation */
export interface MiddlewareHooks {
  onMiddlewareEnter?: (event: {
    requestId: string;
    name: string;
    index: number;
    totalCount: number;
    phase: string;
    timestamp: number;
  }) => void;

  onMiddlewareExit?: (event: {
    requestId: string;
    name: string;
    index: number;
    duration: number;
    phase: string;
    beforeDuration: number;
    afterDuration: number;
    headersAdded: string[];
    timestamp: number;
  }) => void;

  onMiddlewareError?: (event: {
    requestId: string;
    name: string;
    index: number;
    phase: string;
    error: string;
    timestamp: number;
  }) => void;
}

/** Schema validation pass/fail instrumentation */
export interface ValidationHooks {
  onValidationStart?: (event: {
    requestId: string;
    target: "variables" | "response" | "receive";
    timestamp: number;
  }) => void;

  onValidationPass?: (event: {
    requestId: string;
    target: "variables" | "response" | "receive";
    duration: number;
    timestamp: number;
  }) => void;

  onValidationFail?: (event: {
    requestId: string;
    target: "variables" | "response" | "receive";
    issues: readonly unknown[];
    duration: number;
    timestamp: number;
  }) => void;
}

/** Raw HTTP fetch timing — wraps the underlying fetch() call */
export interface HttpFetchHooks {
  onHttpFetchStart?: (event: {
    requestId: string;
    url: string;
    method: string;
    timestamp: number;
  }) => void;

  onHttpFetchEnd?: (event: {
    requestId: string;
    status: number;
    duration: number;
    timestamp: number;
  }) => void;

  onHttpFetchError?: (event: { requestId: string; message: string; timestamp: number }) => void;
}
