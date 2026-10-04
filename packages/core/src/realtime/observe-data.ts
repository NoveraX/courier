import type { WSChannel } from "./types";

/**
 * The method by which a channel that holds what it sent before its first
 * data listener lets that data be watched without being taken: the
 * in-process channel holds what `onJoin` sent for its caller, who can only
 * listen once the channel is returned.
 */
export const OBSERVE_DATA = Symbol.for("courier.channel.observe-data");

/** A channel whose data can be watched without being taken from its caller. */
export interface ObservableChannel {
  /**
   * Hear every message the channel delivers, those it holds already first.
   *
   * @returns Stops hearing them
   */
  [OBSERVE_DATA](handler: (data: unknown) => void): () => void;
}

/**
 * Hear each message a channel delivers, as Studio's instrumentation does,
 * without becoming the listener a holding channel releases its first messages
 * to: those stay for the caller's own first listener.
 *
 * @param channel - The channel
 * @param handler - Hears each message
 * @returns Stops hearing them
 * @example
 * ```ts
 * const stop = observeData(channel, (data) => record(data));
 * ```
 */
export function observeData(
  channel: WSChannel<unknown, unknown>,
  handler: (data: unknown) => void,
): () => void {
  return isObservable(channel) ? channel[OBSERVE_DATA](handler) : channel.on("data", handler);
}

function isObservable(channel: object): channel is ObservableChannel {
  return typeof Reflect.get(channel, OBSERVE_DATA) === "function";
}
