// ---------------------------------------------------------------------------
// Server-side abstractions & infrastructure interfaces
// ---------------------------------------------------------------------------

/** Minimal WebSocket interface — works with native WS, ws library, Deno, Bun */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", handler: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", handler: (event: { code: number }) => void): void;
  addEventListener(type: "error", handler: (event: unknown) => void): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
}

// ---------------------------------------------------------------------------
// Adapter lifecycle — shared by all infrastructure adapters
// ---------------------------------------------------------------------------

/** Base lifecycle for adapters that manage external connections (Redis, NATS, etc.) */
export interface AdapterLifecycle {
  /** Initialize the adapter connection (e.g. connect to Redis) */
  connect(): Promise<void>;
  /** Gracefully close the adapter connection */
  disconnect(): Promise<void>;
  /** Synchronous health check — returns cached connection status */
  isHealthy(): boolean;
  /** Register an error listener; returns unsubscribe function */
  onError(handler: (error: Error) => void): () => void;
}

// ---------------------------------------------------------------------------
// Pub/Sub adapter — horizontal scaling for WS broadcast
// ---------------------------------------------------------------------------

/** Internal envelope wrapping published messages for echo prevention */
export interface PubSubEnvelope<TPayload = unknown> {
  /** Origin server UUID — messages from self are skipped */
  origin: string;
  payload: TPayload;
  timestamp: number;
}

/** Adapter for horizontal scaling via pub/sub (e.g. Redis Pub/Sub, NATS) */
export interface PubSubAdapter extends AdapterLifecycle {
  /**
   * Publish a message to all subscribers across replicas.
   * Implementations must wrap payload in {@link PubSubEnvelope} with origin ID.
   */
  publish(topic: string, message: unknown): Promise<void>;
  /**
   * Subscribe to a topic. Handler receives raw payload (envelope is unwrapped).
   * Implementations must skip messages where `envelope.origin === localId`.
   * @returns Unsubscribe function
   */
  subscribe(topic: string, handler: (message: unknown) => void): Promise<() => void>;
}

// ---------------------------------------------------------------------------
// Stream adapter — SSE Last-Event-ID resume across replicas
// ---------------------------------------------------------------------------

/** Persisted SSE event for history replay */
export interface StoredEvent {
  /** Unique, monotonically ordered event ID (e.g. Redis Stream ID or counter) */
  id: string;
  /** SSE event type (optional named event) */
  event?: string | undefined;
  /** Serialized event payload */
  data: unknown;
  /** Unix ms timestamp when the event was stored */
  timestamp: number;
}

/** Adapter for SSE event persistence and Last-Event-ID resume */
export interface StreamAdapter extends AdapterLifecycle {
  /** Append an event to the topic stream; returns the assigned event ID */
  append(topic: string, event: Omit<StoredEvent, "id">): Promise<string>;
  /** Retrieve events after the given ID (for Last-Event-ID resume) */
  getHistory(topic: string, afterId: string, limit?: number): Promise<StoredEvent[]>;
  /** Trim the stream to keep at most `maxLen` recent events */
  trim(topic: string, maxLen: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Presence adapter — multi-tab user tracking with heartbeat
// ---------------------------------------------------------------------------

/** Single presence entry — one per connection (supports multi-tab) */
export interface PresenceEntry {
  /** Application-level user identifier */
  userId: string;
  /** Unique connection identifier (one per tab/device) */
  connectionId: string;
  /** Arbitrary user-defined metadata (cursor position, status, etc.) */
  metadata: Record<string, unknown>;
  /** Unix ms when the connection first joined */
  joinedAt: number;
  /** Unix ms of last heartbeat (used for stale detection) */
  lastSeenAt: number;
}

/** Diff payload broadcast on presence changes */
export interface PresenceDiff {
  joins: PresenceEntry[];
  leaves: PresenceEntry[];
}

/** Adapter for presence tracking across replicas */
export interface PresenceAdapter extends AdapterLifecycle {
  /** Register a new presence entry for a connection */
  track(topic: string, entry: Omit<PresenceEntry, "joinedAt" | "lastSeenAt">): Promise<void>;
  /** Update metadata for an existing connection */
  update(topic: string, connectionId: string, metadata: Record<string, unknown>): Promise<void>;
  /** Remove a connection from presence */
  untrack(topic: string, connectionId: string): Promise<void>;
  /** List all active entries for a topic */
  list(topic: string): Promise<PresenceEntry[]>;
  /** Refresh the heartbeat timestamp for a connection */
  heartbeat(topic: string, connectionId: string): Promise<void>;
  /**
   * Remove entries whose last heartbeat is more than `staleThresholdMs`
   * milliseconds ago — a duration, not a timestamp; returns swept entries
   */
  sweep(topic: string, staleThresholdMs: number): Promise<PresenceEntry[]>;
  /** Subscribe to presence diffs (joins/leaves) on a topic */
  onDiff(topic: string, handler: (diff: PresenceDiff) => void): () => void;
}
