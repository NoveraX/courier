/**
 * Realtime hook option and result types (subscriptions and channels).
 *
 * Describes the option and return shapes of `useSubscription` (SSE) and
 * `useChannel` (WebSocket) hooks exposed by `QueryGroupClient`.
 */

import type { ConfigurationError } from "@noverax/courier";
import type { ConnectionStatus, RealtimeError, SSEEvent } from "@noverax/courier/realtime";

import type { WithVariables } from "./types-helpers";

export type CourierSubscriptionOptions<TResponse, TVariables> = WithVariables<TVariables> & {
  /** Disable the subscription (default: true) */
  enabled?: boolean | undefined;
  /** Data to show immediately while the connection is being established */
  optimisticData?: TResponse | undefined;
  /**
   * How many of the stream's latest events `events` keeps: 100 unless set.
   * `Infinity` keeps every event, and the list then grows for as long as the
   * stream runs.
   */
  maxEvents?: number | undefined;
  /** Called on each incoming SSE event */
  onData?: ((event: SSEEvent<TResponse>) => void) | undefined;
  /**
   * Called when the stream fails or is refused (a `RealtimeError` whose
   * `code` tells why: 4401 auth, 4403 forbidden, 4422 invalid variables,
   * 5000 server failure), when reconnecting gives up (`ConnectionError`),
   * or when the stream cannot be opened at all (a `ConfigurationError`,
   * such as a malformed proxy path)
   */
  onError?: ((error: Error) => void) | undefined;
  /** Called on connection status changes */
  onStatusChange?: ((status: ConnectionStatus) => void) | undefined;
};

/**
 * Reactive state returned by useSubscription. It belongs to the stream the
 * current method and variables name: when either changes, `data`, `events`
 * and `error` start over, and `status` is `connecting` again.
 */
export interface SubscriptionResult<TData> {
  /** Latest event payload, or `optimisticData` until the first one arrives */
  data: TData | undefined;
  /** The stream's latest events, oldest first: at most `maxEvents` of them */
  events: SSEEvent<TData>[];
  /**
   * The stream's connection status: `connecting` until it says otherwise,
   * `disconnected` while disabled or once it could not be opened
   */
  status: ConnectionStatus;
  /** Why the stream failed or could not be opened; cleared by the next event */
  error: Error | undefined;
  /** Manually close the subscription */
  close: () => void;
  /**
   * Reconnect at once: the stream's connection now, rather than after the
   * wait it is in; a stream its server ended or refused is opened again —
   * after the user signed in anew, say. Clears `error`.
   */
  reconnect: () => void;
}

/**
 * What a channel reports as its error: a `RealtimeError` from the server, or
 * what kept the channel from opening at all — the `ConfigurationError` of a
 * proxy without `proxyPath.ws`, the `RealtimeValidationError` of a path
 * parameter left empty, or any other failure as a `ConnectionError`.
 */
export type ChannelError = RealtimeError | ConfigurationError;

export type CourierChannelOptions<TReceive, TVariables> = WithVariables<TVariables> & {
  /** Disable the channel (default: true) */
  enabled?: boolean | undefined;
  /** Called on each incoming message from the server */
  onData?: ((message: TReceive) => void) | undefined;
  /**
   * Called when the server refuses a message, a handler fails, or the
   * channel ends with a reason — with the `RealtimeError`, whose `code`
   * tells them apart (4403 forbidden, 4422 invalid, …) — or when the channel
   * cannot be opened at all, with the error that says why
   */
  onError?: ((error: ChannelError) => void) | undefined;
  /** Called on connection status changes */
  onStatusChange?: ((status: ConnectionStatus) => void) | undefined;
};

/**
 * Reactive state returned by useChannel. It belongs to the channel the
 * current method and variables name: when either changes, `lastMessage` and
 * `error` start over, and `status` is `connecting` again.
 */
export interface ChannelResult<TSend, TReceive> {
  /** Latest message received from the server */
  lastMessage: TReceive | undefined;
  /**
   * The channel's connection status: `connecting` until it says otherwise,
   * `disconnected` while disabled or once it could not be opened
   */
  status: ConnectionStatus;
  /** The last error reported on this channel; cleared on reconnect */
  error: ChannelError | undefined;
  /**
   * Send a message to the server. One sent before the channel has opened
   * waits for it; one sent while the channel is disabled or closed is
   * dropped with a warning.
   *
   * @returns Whether the message went out or waits for the channel; `false` when it was dropped
   */
  send: (data: TSend) => boolean;
  /** Manually close the channel */
  close: () => void;
  /**
   * Reconnect at once: the channel's socket now, rather than after the wait
   * it is in; a channel its server ended or refused is joined again — after
   * the user signed in anew, say. Clears `error`.
   */
  reconnect: () => void;
}
