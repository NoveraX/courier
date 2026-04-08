/**
 * Realtime hook option and result types (subscriptions and channels).
 *
 * Describes the option and return shapes of `useSubscription` (SSE) and
 * `useChannel` (WebSocket) hooks exposed by `QueryGroupClient`.
 */

import type { ConnectionStatus, SSEEvent } from "@noverax/nexus/realtime";

import type { WithVariables } from "./types-helpers";

export type NexusSubscriptionOptions<TResponse, TVariables> = WithVariables<TVariables> & {
  /** Disable the subscription (default: true) */
  enabled?: boolean;
  /** Data to show immediately while the connection is being established */
  optimisticData?: TResponse;
  /** Called on each incoming SSE event */
  onData?: (event: SSEEvent<TResponse>) => void;
  /** Called when a connection error occurs */
  onError?: (error: Error) => void;
  /** Called on connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
};

/** Reactive state returned by useSubscription */
export interface SubscriptionResult<TData> {
  /** Latest event payload */
  data: TData | undefined;
  /** All received events (append-only) */
  events: SSEEvent<TData>[];
  /** Current connection status */
  status: ConnectionStatus;
  /** Last connection error */
  error: Error | undefined;
  /** Manually close the subscription */
  close: () => void;
}

export type NexusChannelOptions<TReceive, TVariables> = WithVariables<TVariables> & {
  /** Disable the channel (default: true) */
  enabled?: boolean;
  /** Called on each incoming message from the server */
  onData?: (message: TReceive) => void;
  /** Called when a connection error occurs */
  onError?: (error: Error) => void;
  /** Called on connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
};

/** Reactive state returned by useChannel */
export interface ChannelResult<TSend, TReceive> {
  /** Latest message received from the server */
  lastMessage: TReceive | undefined;
  /** Current connection status */
  status: ConnectionStatus;
  /** Last connection error */
  error: Error | undefined;
  /** Send a message to the server */
  send: (data: TSend) => void;
  /** Manually close the channel */
  close: () => void;
}
