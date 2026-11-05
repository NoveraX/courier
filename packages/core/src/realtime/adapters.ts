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

/** How long a step of an adapter's life may take. */
export interface AdapterDeadline {
  /** Milliseconds; the step settles by then, whatever the server does */
  timeoutMs?: number | undefined;
}

/** Base lifecycle for adapters that manage external connections (Redis, NATS, etc.) */
export interface AdapterLifecycle {
  /**
   * Resolve once the adapter can reach its server. An adapter works without
   * this call, and keeps trying to connect whatever it answers: a server
   * that is not there at start is reached once it comes, rather than never.
   *
   * @throws Error when it is not connected within `timeoutMs`
   */
  connect(options?: AdapterDeadline): Promise<void>;
  /** Stop for good, letting go of what it holds on the server, within `timeoutMs` */
  disconnect(options?: AdapterDeadline): Promise<void>;
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

/**
 * Where a pub/sub adapter stands: `connecting` until it first reaches its
 * server, `ready` while it does, `degraded` once it lost it and is getting
 * it back, `stopped` for good after `disconnect()`.
 */
export type AdapterState = "connecting" | "ready" | "degraded" | "stopped";

/** What a pub/sub adapter reports of its work, for health checks and metrics. */
export interface PubSubStats {
  readonly state: AdapterState;
  /** Channels a handler asked for, and those the server confirmed */
  readonly channels: { readonly wanted: number; readonly confirmed: number };
  /** Messages published while it was not ready, waiting to be sent */
  readonly queued: { readonly messages: number; readonly bytes: number };
  /** Messages it let go of unsent: its queue was full, or they waited too long */
  readonly dropped: number;
  /** Messages it sent, and messages of other replicas it delivered */
  readonly published: number;
  readonly delivered: number;
}

/**
 * Adapter for horizontal scaling via pub/sub (e.g. Redis Pub/Sub, NATS).
 *
 * What an implementation owes the handlers that use it:
 * - it listens from the moment it is made; `connect()` checks it, it is not
 *   what makes it work;
 * - a subscription is a wish it keeps: made while its server is away, or
 *   refused, it is made again once the server answers, and every one is
 *   made again after each reconnect;
 * - a message published while it is not ready waits in a queue bounded by
 *   count, bytes and age; past them the oldest are dropped, counted and
 *   reported, never silently;
 * - `disconnect()` settles within its deadline, whatever the server does.
 */
export interface PubSubAdapter extends AdapterLifecycle {
  readonly state: AdapterState;
  /** Hear each change of state; returns the function that stops hearing it */
  onStateChange(listener: (state: AdapterState) => void): () => void;
  /**
   * Publish a message to all subscribers across replicas, or queue it while
   * the adapter is not ready. Implementations wrap the payload in
   * {@link PubSubEnvelope} with their origin. It never rejects because the
   * server is away; it rejects once the adapter is stopped.
   */
  publish(topic: string, message: unknown): Promise<void>;
  /**
   * Subscribe to a topic: resolves at once, the adapter making the
   * subscription as soon as and as often as its server needs it. The
   * handler receives the payload of other replicas' messages; the
   * adapter's own are skipped.
   * @returns Unsubscribe function
   */
  subscribe(topic: string, handler: (message: unknown) => void): Promise<() => void>;
  /** What it is doing now */
  stats(): PubSubStats;
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

// ---------------------------------------------------------------------------
// Connection leases — what a limit on one key's connections counts
// ---------------------------------------------------------------------------

/** What a scope's limit does with a connection over it. */
export type LeaseOverflow = "evict-oldest" | "reject";

/** The limit a lease is taken under. */
export interface LeaseRule {
  /** Leases a scope holds at most */
  readonly max: number;
  /** Over it, the oldest leases are given up for the new one, or the new one is refused */
  readonly onExceed: LeaseOverflow;
}

/** A lease a replica holds, as it renews it. */
export interface HeldLease {
  readonly scope: string;
  readonly lease: string;
}

/** A lease granted, with the leases given up for it; or refused. */
export type LeaseGrant =
  | { readonly admitted: true; readonly evict: readonly string[] }
  | { readonly admitted: false };

/**
 * Where the leases of a limit on one key's connections are kept: this
 * replica's memory, or a store every replica shares, as Redis is, so the
 * limit counts the key's connections wherever they are held. Each decision
 * is the store's alone, made at once, so two connections arriving together
 * on two replicas never both take the last place, nor give up the same
 * lease twice. A shared store lets a lease lapse unless it is renewed, so a
 * replica that stops without releasing frees its leases in time.
 */
export interface ConnectionLeaseStore {
  /** Take a lease in a scope, under its rule: the oldest given up for it, or it refused */
  acquire(scope: string, lease: string, rule: LeaseRule): Promise<LeaseGrant>;
  /** Keep the leases this replica holds from lapsing */
  renew(leases: readonly HeldLease[]): Promise<void>;
  /** Give a lease up */
  release(scope: string, lease: string): Promise<void>;
}
