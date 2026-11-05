import type { RealtimeError } from "./errors";
import type { ConnectionStatus } from "./types";

/** One thing a subscription delivered: its data, and what came with it. */
export interface StreamEvent<TData = unknown> {
  readonly data: TData;
  /** A stream's event id, which a reconnecting client resumes after */
  readonly id?: string | undefined;
  /** A stream's event name, when it is not `message` */
  readonly event?: string | undefined;
  /** A stream's own wait before its client reconnects, in ms */
  readonly retry?: number | undefined;
  /** The number of a channel's event in its topic's order */
  readonly seq?: number | undefined;
}

/** What `open` says each time a subscription opens. */
export interface OpenInfo {
  /** Whether this is the subscription's first open */
  readonly first: boolean;
  /**
   * Whether the server sent everything since the subscription last stood
   * open: nothing was missed. `false` after a reconnect means the server
   * could not tell or could not make up for it — read the state again.
   */
  readonly resumed: boolean;
}

/** How a subscription ended. */
export type CloseInfo =
  /** The application closed it: `close()`, a loop left early, a component unmounted */
  | { readonly reason: "closed" }
  /** The server finished it */
  | { readonly reason: "completed" }
  /** The server failed or refused it, or its connection was refused for good */
  | { readonly reason: "failed"; readonly error: RealtimeError };

/** The events of a subscription, and what each listener hears. */
export interface SubscriptionEvents<TData> {
  /** Each thing it delivers: the data, and the event it came in */
  data: (data: TData, event: StreamEvent<TData>) => void;
  /**
   * What the server refused or failed — a message it would not take, a
   * handler that threw, a message dropped from a full queue: the
   * subscription goes on — and the error it ended with, just before
   * `disconnected` and `close`.
   */
  error: (error: RealtimeError) => void;
  /** Each change of status */
  status: (status: ConnectionStatus) => void;
  /** It is open: on its first open, after each reconnect, and when the server could not keep its order */
  open: (info: OpenInfo) => void;
  /** It ended; after a server ended it, `reconnect()` opens it again */
  close: (info: CloseInfo) => void;
}

/** The name of one of a subscription's events. */
export type SubscriptionEvent = keyof SubscriptionEvents<unknown>;

/**
 * What calling a stream or a push channel returns, and what a channel with
 * `.send()` is besides its `send`: one shape for every kind.
 *
 * Read it with listeners — `on("data")` — or with `for await`, which yields
 * each event and ends as the subscription ends: it rejects with the
 * `RealtimeError` the server failed or refused it with, and leaving the loop
 * early closes the subscription. What comes before anything reads it is
 * kept for the first reader, the oldest dropped past a thousand events.
 *
 * A dropped connection is reconnected without ending the subscription.
 */
export interface Subscription<TData = unknown> {
  /**
   * Listen to an event. An event the subscription does not have is refused
   * by the types, and throws `ConfigurationError` `UNKNOWN_EVENT`.
   *
   * @returns Stops listening
   */
  on<TEvent extends SubscriptionEvent>(
    event: TEvent,
    listener: SubscriptionEvents<TData>[TEvent],
  ): () => void;
  [Symbol.asyncIterator](): AsyncIterableIterator<StreamEvent<TData>>;
  /**
   * Connect again now: a live subscription's connection stops waiting out
   * its backoff, or drops its socket for a new one — for every subscription
   * on it — and one the server ended opens again, its listeners kept. One
   * the application closed stays closed.
   */
  reconnect(): void;
  /** End the subscription and let go of its connection. */
  close(): void;
  /** Its status, changes of which `status` tells */
  readonly status: ConnectionStatus;
  /** Events dropped because they came faster than they were read */
  readonly dropped: number;
}

/** A WebSocket channel the caller sends on as well: a subscription, and `send`. */
export interface WSChannel<TSend = unknown, TReceive = unknown> extends Subscription<TReceive> {
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
}
