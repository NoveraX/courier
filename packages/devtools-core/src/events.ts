/** All DevTools event types */
export type EventType =
  // Connection
  | "connection:init"
  | "connection:heartbeat"
  | "connection:sources"
  // Request lifecycle
  | "request:start"
  | "request:end"
  | "request:error"
  | "request:abort"
  // HTTP layer
  | "http:fetch:start"
  | "http:fetch:end"
  | "http:fetch:error"
  // Middleware
  | "middleware:enter"
  | "middleware:exit"
  | "middleware:error"
  // Validation
  | "validation:start"
  | "validation:pass"
  | "validation:fail"
  // Proxy
  | "proxy:receive"
  | "proxy:respond"
  // Cache
  | "cache:hit"
  | "cache:miss"
  // Deduplication
  | "dedup:abort"
  | "dedup:reuse";

/** Base envelope for all events */
export interface DevToolsEvent {
  id: string;
  type: EventType;
  timestamp: number;
  sessionId: string;
}

/** Source/group/endpoint map sent on connection */
export interface SourceMap {
  [sourceName: string]: {
    baseURL: string;
    groups: {
      [groupName: string]: {
        prefix: string;
        endpoints: {
          [methodName: string]: {
            type: "query" | "mutation" | undefined;
            hasVariablesSchema: boolean;
            hasResponseSchema: boolean;
          };
        };
      };
    };
  };
}

// ── Connection Events ──────────────────────────────────────────────────────────

export interface ConnectionInitEvent extends DevToolsEvent {
  type: "connection:init";
  framework: string;
  nexusVersion: string;
  sources: SourceMap;
}

export interface ConnectionHeartbeatEvent extends DevToolsEvent {
  type: "connection:heartbeat";
}

export interface ConnectionSourcesEvent extends DevToolsEvent {
  type: "connection:sources";
  sources: SourceMap;
}

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
  headers: Record<string, string>;
  timing: RequestTiming;
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

export interface RequestAbortEvent extends DevToolsEvent {
  type: "request:abort";
  requestId: string;
  reason: "deduplication" | "manual" | "timeout";
}

// ── HTTP Events ────────────────────────────────────────────────────────────────

export interface HttpFetchStartEvent extends DevToolsEvent {
  type: "http:fetch:start";
  requestId: string;
  url: string;
  method: string;
}

export interface HttpFetchEndEvent extends DevToolsEvent {
  type: "http:fetch:end";
  requestId: string;
  status: number;
  duration: number;
}

export interface HttpFetchErrorEvent extends DevToolsEvent {
  type: "http:fetch:error";
  requestId: string;
  message: string;
}

// ── Middleware Events ──────────────────────────────────────────────────────────

export interface MiddlewareEnterEvent extends DevToolsEvent {
  type: "middleware:enter";
  requestId: string;
  name: string;
  index: number;
  totalCount: number;
}

export interface MiddlewareExitEvent extends DevToolsEvent {
  type: "middleware:exit";
  requestId: string;
  name: string;
  index: number;
  duration: number;
}

export interface MiddlewareErrorEvent extends DevToolsEvent {
  type: "middleware:error";
  requestId: string;
  name: string;
  index: number;
  error: string;
}

// ── Validation Events ──────────────────────────────────────────────────────────

export interface ValidationStartEvent extends DevToolsEvent {
  type: "validation:start";
  requestId: string;
  target: "variables" | "response";
}

export interface ValidationPassEvent extends DevToolsEvent {
  type: "validation:pass";
  requestId: string;
  target: "variables" | "response";
  duration: number;
}

export interface ValidationFailEvent extends DevToolsEvent {
  type: "validation:fail";
  requestId: string;
  target: "variables" | "response";
  issues: readonly unknown[];
  duration: number;
}

// ── Proxy Events ──────────────────────────────────────────────────────────────

export interface ProxyReceiveEvent extends DevToolsEvent {
  type: "proxy:receive";
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
}

export interface ProxyRespondEvent extends DevToolsEvent {
  type: "proxy:respond";
  proxyMethod: "GET" | "POST";
  source: string;
  group: string | undefined;
  method: string;
  status: number;
}

// ── Union type ─────────────────────────────────────────────────────────────────

export type AnyDevToolsEvent =
  | ConnectionInitEvent
  | ConnectionHeartbeatEvent
  | ConnectionSourcesEvent
  | RequestStartEvent
  | RequestEndEvent
  | RequestErrorEvent
  | RequestAbortEvent
  | HttpFetchStartEvent
  | HttpFetchEndEvent
  | HttpFetchErrorEvent
  | MiddlewareEnterEvent
  | MiddlewareExitEvent
  | MiddlewareErrorEvent
  | ValidationStartEvent
  | ValidationPassEvent
  | ValidationFailEvent
  | ProxyReceiveEvent
  | ProxyRespondEvent;
