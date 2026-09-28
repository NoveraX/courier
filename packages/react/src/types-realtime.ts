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
  enabled?: boolean;
  /** Data to show immediately while the connection is being established */
  optimisticData?: TResponse;
  /** Called on each incoming SSE event */
  onData?: (event: SSEEvent<TResponse>) => void;
  /**
   * Called when the stream fails or is refused (a `RealtimeError` whose
   * `code` tells why: 4401 auth, 4403 forbidden, 4422 invalid variables,
   * 5000 server failure), when reconnecting gives up (`ConnectionError`),
   * or when the stream cannot be opened at all (a `ConfigurationError`,
   * such as a malformed proxy path)
   */
  onError?: (error: Error) => void;
  /** Called on connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
};

/**
 * Reactive state returned by useSubscription. It belongs to the stream the
 * current method and variables name: when either changes, `data`, `events`
 * and `error` start over, and `status` is `connecting` again.
 */
export interface SubscriptionResult<TData> {
  /** Latest event payload, or `optimisticData` until the first one arrives */
  data: TData | undefined;
  /** Every event this stream has delivered, oldest first */
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
}

/**
 * What a channel reports as its error: a `RealtimeError` from the server, or
 * the `ConfigurationError` that kept the channel from opening at all, such as
 * a proxy without `proxyPath.ws`.
 */
export type ChannelError = RealtimeError | ConfigurationError;

export type CourierChannelOptions<TReceive, TVariables> = WithVariables<TVariables> & {
  /** Disable the channel (default: true) */
  enabled?: boolean;
  /** Called on each incoming message from the server */
  onData?: (message: TReceive) => void;
  /**
   * Called when the server refuses a message, a handler fails, or the
   * channel ends with a reason — with the `RealtimeError`, whose `code`
   * tells them apart (4403 forbidden, 4422 invalid, …) — or when the channel
   * cannot be opened at all, with the `ConfigurationError` that says why
   */
  onError?: (error: ChannelError) => void;
  /** Called on connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
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
   */
  send: (data: TSend) => void;
  /** Manually close the channel */
  close: () => void;
}
