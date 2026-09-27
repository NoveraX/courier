import type {
  ConnectionRegistry,
  SSEConnectionRegistry,
  SSELifecycleConfig,
} from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import type { PubSubAdapter } from "@noverax/courier/realtime";

/** Options for `createCourierServer` */
export interface CourierServerOptions extends SSELifecycleConfig {
  /**
   * The API sources this server answers for. They stay its own: another
   * server or a `registerSources` call in the same process does not change
   * them, and they are not written into the process-wide registry.
   */
  sources: Sources;
  /** Server port (default 3001) */
  port?: number;
  /** Server host (default "localhost") */
  host?: string;
  /**
   * Origins of the browser apps that may call the server, for CORS and the
   * WebSocket origin check. Left out, the server answers its own origin only,
   * and loopback origins outside production.
   */
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
  /**
   * Called when the server itself fails — a port already in use, a socket
   * error after start. Without it such a failure is only logged; the process
   * is never ended on the host's behalf.
   */
  onServerError?: (error: Error) => void;
}

/** Handle returned by createCourierServer for lifecycle control */
export interface CourierServer {
  /** Base URL of the running server */
  url: string;
  /**
   * Resolves with the base URL once the server is listening, and rejects if
   * it never gets there. Await it to find out whether startup succeeded —
   * a failed listen is reported here rather than by ending the process.
   *
   * @example
   * ```ts
   * const server = createCourierServer({ sources, port: 3001 });
   * try {
   *   await server.ready;
   * } catch {
   *   // pick another port, or report it — the host is still running
   * }
   * ```
   */
  readonly ready: Promise<string>;
  /** Gracefully shut down the server */
  stop(): Promise<void>;
  /** Active SSE connection registry */
  readonly sseConnections: SSEConnectionRegistry;
  /** Active WS connection registry */
  readonly wsConnections: ConnectionRegistry;
}
