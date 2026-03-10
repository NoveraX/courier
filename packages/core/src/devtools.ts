/** DevTools instrumentation hooks — zero-cost when not connected */
export interface DevToolsHooks {
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
    headers: Record<string, string>;
    timing: {
      total: number;
      middleware: number;
      fetch: number;
      validation: number;
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

  onMiddlewareEnter?: (event: {
    requestId: string;
    name: string;
    index: number;
    totalCount: number;
    timestamp: number;
  }) => void;

  onMiddlewareExit?: (event: {
    requestId: string;
    name: string;
    index: number;
    duration: number;
    timestamp: number;
  }) => void;

  onMiddlewareError?: (event: {
    requestId: string;
    name: string;
    index: number;
    error: string;
    timestamp: number;
  }) => void;

  onValidationStart?: (event: {
    requestId: string;
    target: "variables" | "response";
    timestamp: number;
  }) => void;

  onValidationPass?: (event: {
    requestId: string;
    target: "variables" | "response";
    duration: number;
    timestamp: number;
  }) => void;

  onValidationFail?: (event: {
    requestId: string;
    target: "variables" | "response";
    issues: readonly unknown[];
    duration: number;
    timestamp: number;
  }) => void;

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

  onProxyReceive?: (event: {
    proxyMethod: "GET" | "POST";
    source: string;
    group: string | undefined;
    method: string;
    timestamp: number;
  }) => void;

  onProxyRespond?: (event: {
    proxyMethod: "GET" | "POST";
    source: string;
    group: string | undefined;
    method: string;
    status: number;
    timestamp: number;
  }) => void;

  onCacheHit?: (event: { requestId: string; key: string; age: number; timestamp: number }) => void;

  onCacheMiss?: (event: { requestId: string; key: string; timestamp: number }) => void;

  onCacheStore?: (event: {
    requestId: string;
    key: string;
    ttl: number;
    timestamp: number;
  }) => void;

  onCacheInvalidate?: (event: { key: string; reason: string; timestamp: number }) => void;

  onDedupAbort?: (event: { requestId: string; key: string; timestamp: number }) => void;

  onDedupReuse?: (event: { requestId: string; key: string; timestamp: number }) => void;

  onUploadProgress?: (event: {
    requestId: string;
    loaded: number;
    total: number;
    percentage: number;
    timestamp: number;
  }) => void;

  onUploadComplete?: (event: { requestId: string; timestamp: number }) => void;
}

/** Global hooks object. Devtools-core sets these callbacks via connectDevTools(). */
export const devtoolsHooks: DevToolsHooks = {};

let counter = 0;

/** Generate a unique request ID for devtools tracing */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}
