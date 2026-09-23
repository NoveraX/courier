// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** Observable connection status for SSE/WS clients */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

/** Backoff configuration for auto-reconnection */
export interface BackoffConfig {
  /** Initial delay in ms (default 1000) */
  initialMs?: number;
  /** Maximum delay cap in ms (default 30000) */
  maxMs?: number;
  /** Multiplier per attempt (default 2) */
  factor?: number;
  /** Add randomized jitter to prevent thundering herd (default true) */
  jitter?: boolean;
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

/** A single Server-Sent Event */
export interface SSEEvent<TData = unknown> {
  /** Event ID — used for Last-Event-ID on reconnect */
  id?: string;
  /** Named event type (default: "message"). Names starting with `courier:` are reserved. */
  event?: string;
  /** Event payload */
  data: TData;
  /** Client reconnection delay hint in ms */
  retry?: number;
}

/** Server-side context passed to SSE endpoint handlers */
export interface SSEContext<TVariables = unknown> {
  /** Typed variables from the subscription request */
  variables: TVariables;
  /** Fires when the client disconnects */
  signal: AbortSignal;
  /** Last-Event-ID from reconnecting client (for resume) */
  lastEventId?: string;
  /** Request headers (for auth extraction in middleware) */
  headers: Headers;
}

/**
 * Server-side SSE handler — async generator yielding events.
 *
 * Returning ends the stream for the client, which then stops reading and
 * does not reconnect. Throwing fails it: throw a `RealtimeError` (such as
 * `ForbiddenError("Not a member of this room")`) for its code and message
 * to reach the client; any other error reaches it as code 5000 "Stream
 * failed", and in full only the server's log.
 */
export type SSEHandler<TResponse, TVariables = undefined> = (
  ctx: SSEContext<TVariables>,
) => AsyncGenerator<SSEEvent<TResponse>, void, unknown>;

/**
 * Client-side SSE subscription — async iterable with lifecycle control.
 *
 * Iteration ends when the server finished the stream, when `close()` is
 * called, or when the loop is left early (`break` closes the subscription).
 * It rejects with a `RealtimeError` when the server failed the stream or
 * refused the request (`AuthError`, `ForbiddenError`, …), and with a
 * `ConnectionError` once `maxAttempts` reconnections in a row came to
 * nothing. A dropped connection is reconnected without ending it.
 */
export interface SSESubscription<TData = unknown> {
  [Symbol.asyncIterator](): AsyncIterableIterator<SSEEvent<TData>>;
  /** Terminate the subscription and close the connection */
  close(): void;
  /** Current connection status */
  readonly status: ConnectionStatus;
  /** Number of events dropped due to client-side buffer overflow */
  readonly dropped: number;
  /** Subscribe to status changes */
  on(event: "status", handler: (status: ConnectionStatus) => void): () => void;
}

/**
 * Wrap data with a tracked ID for resumable SSE streams.
 * Clients reconnecting with Last-Event-ID will resume from this point.
 *
 * @example
 * yield tracked(post.id, post);
 */
export function tracked<TData>(id: string, data: TData): SSEEvent<TData> {
  return { id, data };
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

/** Server-side context for WS connections (base) */
export interface WSContext<TVariables = unknown> {
  /** Fully qualified topic (e.g. "api.chat.room#a1b2c3") */
  readonly topic: string;
  /** Typed variables from the subscribe message */
  variables: TVariables;
  /** Unique connection identifier */
  connectionId: string;
  /** Auth/metadata extracted during handshake */
  meta: Record<string, unknown>;
  /**
   * Fires when the subscription ends — the client unsubscribes or its socket
   * closes. A handler waiting on an event that may never come releases what
   * it holds here; otherwise its `finally` runs only the next time it yields.
   */
  readonly signal: AbortSignal;
}

/** Server-side context for bidirectional WS channels */
export interface WSChannelContext<TResponse = unknown, TVariables = unknown>
  extends WSContext<TVariables> {
  /** Send a typed message to this specific client */
  send(data: TResponse): void;
  /** Broadcast to all subscribers of a topic */
  broadcast(topic: string, data: TResponse): void;
  /** Close this client's connection */
  close(code?: number, reason?: string): void;
}

/** Handlers for a bidirectional WS channel endpoint */
export interface ChannelHandlers<TReceive = unknown, TResponse = unknown, TVariables = unknown> {
  /** Called when a client subscribes to this channel */
  onJoin?(ctx: WSChannelContext<TResponse, TVariables>): void | Promise<void>;
  /** Called on each incoming message from the client */
  onMessage(ctx: WSChannelContext<TResponse, TVariables>, message: TReceive): void | Promise<void>;
  /** Called when a client unsubscribes or disconnects */
  onLeave?(ctx: WSChannelContext<TResponse, TVariables>): void | Promise<void>;
}

/** Server-side WS push handler — async generator (server→client only) */
export type WSPushHandler<TResponse, TVariables = undefined> = (
  ctx: WSContext<TVariables>,
) => AsyncGenerator<TResponse, void, unknown>;

/** Client-side WS channel — bidirectional typed communication */
export interface WSChannel<TSend = unknown, TReceive = unknown> {
  /** Send a typed message to the server */
  send(data: TSend): void;
  /** Subscribe to incoming messages or status changes */
  on(event: "data", handler: (data: TReceive) => void): () => void;
  on(event: "status", handler: (status: ConnectionStatus) => void): () => void;
  /** Close the channel */
  close(): void;
  /** Current connection status */
  readonly status: ConnectionStatus;
}
