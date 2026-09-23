import type { StudioHooks } from "../studio/hooks";
import type { InternalSSERegistry } from "./sse-registry";
/** Read-only SSE connection info exposed via public API */
export interface SSEConnectionInfo {
  readonly connectionId: string;
  readonly connectedAt: number;
  readonly meta: Record<string, unknown>;
  readonly source: string;
  readonly group: string | undefined;
  readonly method: string;
  readonly eventCount: number;
  readonly totalBytes: number;
  readonly lastEventAt: number;
}

/** Formatted SSE event for server-initiated broadcast */
export interface SSEBroadcastEvent {
  /** Event type (maps to SSE `event:` field) */
  event?: string;
  /** Payload (serialized to JSON if not a string) */
  data: unknown;
  /** Optional custom event ID */
  id?: string;
  /** Optional reconnection interval hint in ms */
  retry?: number;
}

/** Result of a broadcast operation — maps connectionId to delivery success */
export type SSEBroadcastResult = Map<string, boolean>;

/** Public API for inspecting and managing active SSE connections */
export interface SSEConnectionRegistry {
  /** Number of active SSE streams */
  readonly count: number;
  /** Whether shutdown has been initiated (new connections are rejected) */
  readonly isShuttingDown: boolean;
  /** Get connection info by ID */
  get(connectionId: string): SSEConnectionInfo | undefined;
  /** Check if a connection exists */
  has(connectionId: string): boolean;
  /** List all active connections */
  list(): SSEConnectionInfo[];
  /** Filter connections by metadata predicate */
  getByMeta(predicate: (meta: Record<string, unknown>) => boolean): SSEConnectionInfo[];
  /** Filter connections by endpoint (all params optional for flexible matching) */
  getByEndpoint(source: string, group?: string, method?: string): SSEConnectionInfo[];
  /** Force-close a single SSE connection */
  disconnect(connectionId: string, reason?: string): void;
  /** Force-close all SSE connections */
  disconnectAll(reason?: string): void;
  /** Send an event to a specific SSE connection (bypasses generator) */
  send(connectionId: string, event: SSEBroadcastEvent): boolean;
  /** Broadcast an event to all connections matching an endpoint filter */
  broadcastToEndpoint(
    source: string,
    event: SSEBroadcastEvent,
    group?: string,
    method?: string,
  ): SSEBroadcastResult;
  /** Broadcast an event to connections matching a metadata predicate */
  broadcastToMeta(
    predicate: (meta: Record<string, unknown>) => boolean,
    event: SSEBroadcastEvent,
  ): SSEBroadcastResult;
  /** Broadcast an event to all active connections */
  broadcastAll(event: SSEBroadcastEvent): SSEBroadcastResult;
}

/** SSE lifecycle hooks for connection tracking */
export interface SSELifecycleConfig {
  /** Max concurrent SSE connections. Returns 503 when exceeded. */
  maxSSEConnections?: number;
  /** Called when an SSE stream opens. Return metadata or throw to reject. */
  onSSEConnect?: (info: {
    connectionId: string;
    request: Request;
    source: string;
    group: string | undefined;
    method: string;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Called when an SSE stream closes */
  onSSEDisconnect?: (info: {
    connectionId: string;
    meta: Record<string, unknown>;
    reason: SSECloseReason;
    eventCount: number;
    totalBytes: number;
    duration: number;
  }) => void | Promise<void>;
  /** Called on SSE connection-level error */
  onSSEError?: (info: {
    connectionId: string;
    meta: Record<string, unknown>;
    error: unknown;
  }) => void;
}

/** Reason why an SSE connection was closed */
/**
 * Why an SSE stream closed. `slow_consumer`: the client stopped reading and
 * too many broadcasts in a row could not be queued for it.
 */
export type SSECloseReason =
  | "complete"
  | "error"
  | "disconnect"
  | "shutdown"
  | "max_lifetime"
  | "slow_consumer";

/** Options passed from createSSEHandler to createSSEStream */
export interface SSEStreamOptions {
  connectionId: string;
  requestId: string;
  source: string;
  group: string | undefined;
  method: string;
  meta: Record<string, unknown>;
  registry: InternalSSERegistry;
  dt: StudioHooks;
  t0: number;
  /** Separate TTL signal to detect max_lifetime reason (undefined = no TTL) */
  ttlSignal?: AbortSignal;
  onDisconnect?: SSELifecycleConfig["onSSEDisconnect"];
  onError?: SSELifecycleConfig["onSSEError"];
  /**
   * Studio Playground requestId extracted from the `x-courier-playground-rid`
   * request header. When set, the stream registers its `forceAbort.abort`
   * callback in the process-global playground abort registry so the
   * playground executor can force-close it deterministically (Node loopback
   * fetch abort does NOT propagate to `request.signal` synchronously).
   * Undefined for production traffic — registry is a no-op.
   */
  playgroundRid?: string;
  /**
   * Injected `registerPlaygroundAbort` from `../studio` — accepted as a
   * dependency to keep `createSSEStream` decoupled from the singleton import
   * (testability + tree-shaking when Studio is not used).
   */
  registerPlaygroundAbort?: (requestId: string, abort: () => void) => () => void;
}
