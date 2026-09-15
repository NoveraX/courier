import type { ProxyPath } from "@noverax/nexus";

/** All Studio event types */
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
  | "upload:complete"
  // Stream (SSE/WS)
  | "stream:open"
  | "stream:message"
  | "stream:close"
  | "stream:error"
  // Mock server
  | "mock:server:connect"
  | "mock:server:disconnect"
  | "mock:server:status"
  | "mock:route:list"
  | "mock:store:snapshot"
  | "mock:store:change"
  | "mock:scenario:active"
  | "mock:network:config"
  | "mock:request:start"
  | "mock:request:end"
  | "mock:request:error"
  | "mock:hotreload";

/** Base envelope for all events */
export interface StudioEvent {
  id: string;
  type: EventType;
  timestamp: number;
  sessionId: string;
}

/** Source/group/endpoint map sent on connection */
export interface SourceMap {
  [sourceName: string]: {
    baseURL: string;
    /**
     * The user-app's own HTTP origin (e.g. `http://localhost:3000`) — set
     * via `nexus.config.ts.runtime.appOrigin` or auto-detected from
     * `NEXUS_APP_URL` / `APP_URL`. Stamped onto each source so the Studio
     * Playground UI can resolve relative `proxyPath` values into full
     * clickable URLs (e.g. `/api/sse` → `http://localhost:3000/api/sse`).
     * Omitted when the connecting process never declared one.
     */
    appOrigin?: string;
    /**
     * Per-transport proxy endpoint configuration carried from the source's
     * `defineApi({ proxyPath })`. Studio reads this to display the
     * configured proxy path in the playground without requiring user input.
     * Omitted entirely when the source has no `proxyPath` configured.
     */
    proxyPath?: ProxyPath;
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
            /** HTTP method (GET, POST, PUT, PATCH, DELETE) from endpoint probing */
            httpMethod?: string;
            /** Default variables stub generated from schema shape */
            variablesStub?: Record<string, unknown>;
            /** Transport mode — only present for non-HTTP endpoints */
            transport?: "sse" | "ws";
            /** True when WS channel has a receive schema (bidirectional) */
            hasReceiveSchema?: boolean;
          };
        };
      };
    };
  };
}
