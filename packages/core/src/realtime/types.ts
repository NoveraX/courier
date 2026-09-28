import type { RealtimeError } from "./errors";

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

/**
 * What a channel's subscribers share a topic by, as a channel's `.topic()`
 * returns it: a value JSON carries as it is.
 */
export type TopicKey =
  | string
  | number
  | boolean
  | null
  | readonly TopicKey[]
  | { readonly [key: string]: TopicKey | undefined };

/** Server-side context for WS connections (base) */
export interface WSContext<TVariables = unknown> {
  /**
   * Fully qualified topic, e.g. `api.chat.room#{"room":"a"}`: the endpoint,
   * qualified by the channel's `.topic()` key of the variables, or by all of
   * them when it names none.
   */
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
  /**
   * Send a typed message to this specific client. It is held to the
   * channel's response schema first: what goes out is the schema's output,
   * and a value that does not match throws a `RealtimeValidationError` here.
   */
  send(data: TResponse): void;
  /**
   * Broadcast to every other subscriber of a topic, held to the channel's
   * response schema as `send` is.
   */
  broadcast(topic: string, data: TResponse): void;
  /**
   * End this client's subscription to the channel: its `onLeave` runs, and
   * the client's channel disconnects without rejoining. A `code` other than
   * 1000 is the client's error event (`fromErrorCode(code, reason)`), so a
   * kick can say why.
   */
  close(code?: number, reason?: string): void;
}

/**
 * Handlers for a bidirectional WS channel endpoint.
 *
 * A handler that throws a `RealtimeError` (such as `ForbiddenError("Not a
 * member of this room")`) chooses what the client's `error` event reads;
 * any other error reaches it as code 5000 and, in full, only the server's
 * log. A failed `onJoin` ends the subscription; a failed `onMessage` does not.
 */
export interface ChannelHandlers<TReceive = unknown, TResponse = unknown, TVariables = unknown> {
  /** Called when a client subscribes to this channel */
  onJoin?(ctx: WSChannelContext<TResponse, TVariables>): void | Promise<void>;
  /** Called on each incoming message from the client */
  onMessage(ctx: WSChannelContext<TResponse, TVariables>, message: TReceive): void | Promise<void>;
  /** Called when a client unsubscribes or disconnects */
  onLeave?(ctx: WSChannelContext<TResponse, TVariables>): void | Promise<void>;
}

/**
 * Server-side WS push handler — async generator (server→client only).
 *
 * Returning ends the subscription for the client, whose loop then ends.
 * Throwing fails it: a `RealtimeError` reaches the client's loop as thrown;
 * any other error as code 5000, and in full only the server's log.
 */
export type WSPushHandler<TResponse, TVariables = undefined> = (
  ctx: WSContext<TVariables>,
) => AsyncGenerator<TResponse, void, unknown>;

/** Client-side WS channel — bidirectional typed communication */
export interface WSChannel<TSend = unknown, TReceive = unknown> {
  /**
   * Send a typed message to the server.
   *
   * @returns Whether it went out, or waits for the channel to open or the
   *   connection to come back; `false`, with a warning, when it was dropped:
   *   the channel has ended, the connection is closed, no room is left to
   *   hold it, the socket's buffer is full, or it is larger than the server
   *   accepts — which the channel's `error` event also reports, as `4413`
   */
  send(data: TSend): boolean;
  /** Subscribe to incoming messages or status changes */
  on(event: "data", handler: (data: TReceive) => void): () => void;
  on(event: "status", handler: (status: ConnectionStatus) => void): () => void;
  /**
   * Hear what the server refused or failed: a message it would not take, or
   * a handler that threw — the channel goes on — or the end of the channel
   * itself (join rejected, closed by the server with a reason), which is
   * followed by the `disconnected` status.
   */
  on(event: "error", handler: (error: RealtimeError) => void): () => void;
  /** Close the channel */
  close(): void;
  /** Current connection status */
  readonly status: ConnectionStatus;
}
