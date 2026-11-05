import type { StreamEvent, Subscription } from "./subscription-types";

/**
 * The method by which a subscription that holds what came before its first
 * reader lets it be watched without being taken: an in-process channel holds
 * what `onJoin` sent for its caller, who can only listen once the channel is
 * returned.
 */
export const OBSERVE_DATA = Symbol.for("courier.channel.observe-data");

/** A subscription whose data can be watched without being taken from its reader. */
export interface ObservableChannel {
  /**
   * Hear everything the subscription delivers, what it holds already first,
   * with the event each came in.
   *
   * @returns Stops hearing them
   */
  [OBSERVE_DATA](handler: (data: unknown, event: StreamEvent<unknown>) => void): () => void;
}

/**
 * Hear everything a subscription delivers, as Studio's instrumentation does,
 * without becoming the reader a holding subscription releases what came
 * first to: that stays for the caller's own first reader.
 *
 * @param subscription - The subscription or channel
 * @param handler - Hears each delivery, with the event it came in
 * @returns Stops hearing them
 * @example
 * ```ts
 * const stop = observeData(channel, (data) => record(data));
 * ```
 */
export function observeData(
  subscription: Subscription<unknown>,
  handler: (data: unknown, event: StreamEvent<unknown>) => void,
): () => void {
  return isObservable(subscription)
    ? subscription[OBSERVE_DATA](handler)
    : subscription.on("data", handler);
}

function isObservable(channel: object): channel is ObservableChannel {
  return typeof Reflect.get(channel, OBSERVE_DATA) === "function";
}
