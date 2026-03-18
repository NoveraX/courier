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
  | "proxy:parse"
  | "proxy:origin-reject"
  | "proxy:respond"
  | "proxy:client-timing"
  // Cache
  | "cache:hit"
  | "cache:miss"
  | "cache:store"
  | "cache:invalidate"
  // Deduplication
  | "dedup:abort"
  | "dedup:reuse"
  // Upload
  | "upload:progress"
  | "upload:complete";

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
            middleware?: string[];
            path?: string;
            /** Default variables stub generated from schema shape */
            variablesStub?: Record<string, unknown>;
          };
        };
      };
    };
  };
}
