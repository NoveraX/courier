import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { StudioHooks } from "../studio/hooks";
import type { ConnectionMeta, ConnectResult } from "./connection-meta";
import type { InternalSSERegistry } from "./sse-registry";
import type { ConnectionSelector, MetaValue } from "./ws-registry-types";
/** Read-only SSE connection info exposed via public API */
export interface SSEConnectionInfo {
  readonly connectionId: string;
  readonly connectedAt: number;
  /** A copy of its metadata: what `onSSEConnect` returned as the stream opened */
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
  event?: string | undefined;
  /** Payload (serialized to JSON if not a string) */
  data: unknown;
  /**
   * Optional custom event ID. Without one the event carries no id, so a
   * client reconnecting after it resumes from the last event the stream's
   * generator sent.
   */
  id?: string | undefined;
  /** Optional reconnection interval hint in ms */
  retry?: number | undefined;
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
  /**
   * This replica's streams: every one, or those `selector` names — by id,
   * or by fields of the metadata `onSSEConnect` returned.
   * @throws TypeError for a selector that names no connection
   */
  list(selector?: ConnectionSelector): SSEConnectionInfo[];
  /** Filter connections by endpoint (all params optional for flexible matching) */
  getByEndpoint(source: string, group?: string, method?: string): SSEConnectionInfo[];
  /**
   * End the streams `selector` names — on every replica that shares the
   * handler's pub/sub adapter. A stream ended so says nothing of why: its
   * client reconnects as from a dropped stream, and passes `onSSEConnect`
   * again. Resolves once this replica's are ended and the command for the
   * others has gone to the adapter; rejects with a `TypeError`, ending
   * none, for a selector that names no connection.
   */
  disconnect(selector: ConnectionSelector): Promise<void>;
  /** End every stream of this replica */
  disconnectAll(): void;
  /** Send an event to a specific SSE connection (bypasses generator) */
  send(connectionId: string, event: SSEBroadcastEvent): boolean;
  /** Broadcast an event to all connections matching an endpoint filter */
  broadcastToEndpoint(
    source: string,
    event: SSEBroadcastEvent,
    group?: string,
    method?: string,
  ): SSEBroadcastResult;
  /**
   * Send an event to this replica's streams whose metadata has every field
   * given — 1 to 16 — equal to its value, a string, a finite number or a
   * boolean, as a selector's `meta` compares them.
   * @throws TypeError for fields no selector takes
   */
  broadcastToMeta(
    fields: Readonly<Record<string, MetaValue>>,
    event: SSEBroadcastEvent,
  ): SSEBroadcastResult;
  /** Broadcast an event to all active connections */
  broadcastAll(event: SSEBroadcastEvent): SSEBroadcastResult;
}

/** SSE lifecycle hooks for connection tracking */
export interface SSELifecycleConfig<TConnect extends ConnectResult = ConnectResult> {
  /** Max concurrent SSE connections. Returns 503 when exceeded. */
  maxSSEConnections?: number | undefined;
  /**
   * Called when an SSE stream opens. Return the stream's metadata — an
   * object — or nothing, or throw to refuse the stream: it is answered 403
   * "Connection rejected", and what was thrown is logged, never sent. What it
   * returns types `meta` in the hooks written after it.
   */
  onSSEConnect?:
    | ((info: {
        connectionId: string;
        request: Request;
        source: string;
        group: string | undefined;
        method: string;
      }) => TConnect)
    | undefined;
  /** Called when an SSE stream closes */
  onSSEDisconnect?:
    | ((info: {
        connectionId: string;
        meta: ConnectionMeta<TConnect>;
        reason: SSECloseReason;
        eventCount: number;
        totalBytes: number;
        duration: number;
      }) => void | Promise<void>)
    | undefined;
  /** Called on SSE connection-level error */
  onSSEError?:
    | ((info: { connectionId: string; meta: ConnectionMeta<TConnect>; error: unknown }) => void)
    | undefined;
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
  ttlSignal?: AbortSignal | undefined;
  /** The endpoint's response schema, which every event's data is held to */
  responseSchema?: StandardSchemaV1 | undefined;
  onDisconnect?: SSELifecycleConfig["onSSEDisconnect"] | undefined;
  onError?: SSELifecycleConfig["onSSEError"] | undefined;
  /**
   * Studio Playground requestId extracted from the `x-courier-playground-rid`
   * request header. When set, the stream registers its `forceAbort.abort`
   * callback in the process-global playground abort registry so the
   * playground executor can force-close it deterministically (Node loopback
   * fetch abort does NOT propagate to `request.signal` synchronously).
   * Undefined for production traffic — registry is a no-op.
   */
  playgroundRid?: string | undefined;
  /**
   * Injected `registerPlaygroundAbort` from `../studio` — accepted as a
   * dependency to keep `createSSEStream` decoupled from the singleton import
   * (testability + tree-shaking when Studio is not used).
   */
  registerPlaygroundAbort?: ((requestId: string, abort: () => void) => () => void) | undefined;
}
