import { callThroughProxy } from "./proxy-playground";
import type { ChannelOpener, PlaygroundChannel, StreamOpener } from "./responder-dispatch";

/**
 * Open a stream through the app's proxy route, as the app's browser would.
 *
 * @param sources - The runtime's registered sources
 * @param call - The stream, its variables and headers
 * @param options - The signal that ends the stream when the Playground stops it
 * @returns The subscription, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchSSE(socket, payload, sources, ac.signal, openStreamThroughProxy);
 * ```
 */
export const openStreamThroughProxy: StreamOpener = async (sources, call, { signal }) => {
  const subscription = callThroughProxy(sources, call, false);
  if (!isSubscription(subscription)) {
    throw new Error(`${call.source}.${call.method} is not a stream`);
  }
  signal.addEventListener("abort", () => subscription.close(), { once: true });
  return subscription;
};

/**
 * Open a channel through the app's proxy route, as the app's browser would.
 *
 * @param sources - The runtime's registered sources
 * @param call - The channel, its variables and headers
 * @param options - The signal that closes the channel when the Playground stops it
 * @returns The channel, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchWS(socket, payload, sources, ac.signal, openChannelThroughProxy);
 * ```
 */
export const openChannelThroughProxy: ChannelOpener = async (sources, call, { signal }) => {
  const channel = callThroughProxy(sources, call, false);
  if (!isChannel(channel)) {
    throw new Error(`${call.source}.${call.method} is not a channel`);
  }
  signal.addEventListener("abort", () => channel.close(), { once: true });
  return channel;
};

function isSubscription(value: unknown): value is AsyncIterable<unknown> & { close(): void } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, Symbol.asyncIterator) === "function" &&
    typeof Reflect.get(value, "close") === "function"
  );
}

function isChannel(value: unknown): value is PlaygroundChannel {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "on") === "function" &&
    typeof Reflect.get(value, "send") === "function" &&
    typeof Reflect.get(value, "close") === "function"
  );
}
