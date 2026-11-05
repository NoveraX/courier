import type { RealtimeError } from "./errors";
import type { ConnectionRetry } from "./retry-of";
import type { StreamEvent } from "./subscription-types";

/** What a subscription is told by what runs it. */
export interface SubscriptionSink<TData> {
  connecting(): void;
  reconnecting(): void;
  /** It is open; `resumed` when the server said nothing was missed since it last stood open */
  open(info: { readonly resumed: boolean }): void;
  data(event: StreamEvent<TData>): void;
  /** An error the subscription goes on after */
  error(error: RealtimeError): void;
  /**
   * The server finished it, or it failed with `error`: a `RealtimeError`
   * from the server, or what kept it from opening at all — a
   * `ConfigurationError`, which its loop rejects with as it is
   */
  end(error?: Error): void;
}

/** What runs one kind of subscription: a socket's topic, a stream's requests, a handler in process. */
export interface SubscriptionDriver<TData> {
  /** Start it, telling `sink` what becomes of it. */
  open(sink: SubscriptionSink<TData>): void;
  /** Start it again after the server ended it; a driver without it cannot be reopened. */
  reopen?(sink: SubscriptionSink<TData>): void;
  /** Reconnect it now, while it runs. */
  reconnect(): void;
  /** Let it go: it tells its sink nothing more. */
  close(): void;
  /** Why its connection last went to reconnect, for Studio to tell. */
  retry?(): ConnectionRetry | undefined;
}
