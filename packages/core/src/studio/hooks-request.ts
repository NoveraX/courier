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
      type: "http" | "validation" | "network" | "unknown";
      status?: number;
      message: string;
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
