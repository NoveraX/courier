import type {
  ConnectionRegistry,
  SSEConnectionRegistry,
  SSELifecycleConfig,
} from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import type { PubSubAdapter } from "@noverax/courier/realtime";

/** Configuration for the standalone Courier server */
export interface CourierServerConfig extends SSELifecycleConfig {
  /** Registered API sources (same as framework adapters) */
  sources: Sources;
  /** Server port (default 3001) */
  port?: number;
  /** Server host (default "localhost") */
  host?: string;
  /** Allowed origins for CORS and CSWSH prevention (undefined = allow all) */
  allowedOrigins?: string[];
  /** Optional pub/sub adapter for horizontal WS scaling (e.g. Redis) */
  pubsub?: PubSubAdapter;
  /** WS heartbeat interval in ms (default 25000) */
  heartbeatIntervalMs?: number;
  /** WS pong timeout in ms (default 10000) */
  heartbeatTimeoutMs?: number;
  /** WS max message size in bytes (default 65536) */
  maxPayload?: number;
  /** Attach SIGTERM/SIGINT handlers for graceful shutdown (default true) */
  signals?: boolean;
  /** Additional SSE response headers (e.g., CORS) */
  sseHeaders?: Record<string, string>;
  /** Max SSE connection lifetime in ms */
  sseMaxLifetimeMs?: number;
  /** Callback fired when server starts listening */
  onReady?: (url: string) => void;
  /** Called after WS upgrade. Return metadata or throw to reject. */
  onConnect?: (info: { connectionId: string; request: Request }) => unknown | Promise<unknown>;
  /** Called after WS socket close + topic cleanup */
  onDisconnect?: (info: {
    connectionId: string;
    meta: unknown;
    code: number;
  }) => void | Promise<void>;
  /** Called on WS connection-level error */
  onError?: (info: { connectionId: string; meta: unknown; error: unknown }) => void;
}

/** Handle returned by createCourierServer for lifecycle control */
export interface CourierServer {
  /** Base URL of the running server */
  url: string;
  /** Gracefully shut down the server */
  stop(): Promise<void>;
  /** Active SSE connection registry */
  readonly sseConnections: SSEConnectionRegistry;
  /** Active WS connection registry */
  readonly wsConnections: ConnectionRegistry;
}
