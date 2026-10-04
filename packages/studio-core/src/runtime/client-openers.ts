import type { Sources } from "@noverax/courier/define";
import { directStreamingFactories, isDefinedApi } from "@noverax/courier/internal";

import type { ChannelOpener, StreamCall, StreamOpener } from "./responder-dispatch";

/* A stream this process only calls, opened as its own clients open it: at
   the address of the upstream that serves it, with the call's headers. */
function streamsAsClient(sources: Sources, call: StreamCall) {
  const definition = sources[call.source];
  if (!isDefinedApi(definition)) {
    throw new Error(`Source "${call.source}" is not an API definition this runtime can call`);
  }
  return directStreamingFactories(definition, { headers: call.headers });
}

/**
 * Open an SSE stream this process only calls, as its own clients would:
 * at the upstream that serves it, shown under the row Studio follows.
 *
 * @param sources - The runtime's registered sources
 * @param call - The stream, its variables and headers
 * @param options - When to stop, and the row Studio shows the stream under
 * @returns The subscription, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchSSE(socket, payload, sources, ac.signal, openStreamAsClient);
 * ```
 */
export const openStreamAsClient: StreamOpener = async (sources, call, options) => {
  const { group, method, variables } = call;
  const subscription = streamsAsClient(sources, call).sse(group, method, variables, {
    studioRequestId: options.requestId,
  });
  options.signal.addEventListener("abort", () => subscription.close(), { once: true });
  return subscription;
};

/**
 * Open a WebSocket push this process only calls, as its own clients would.
 *
 * @param sources - The runtime's registered sources
 * @param call - The push, and its variables
 * @param options - When to stop, and the row Studio shows the push under
 * @returns The subscription, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchWSPush(socket, payload, sources, ac.signal, openPushAsClient);
 * ```
 */
export const openPushAsClient: StreamOpener = async (sources, call, options) => {
  const { group, method, variables } = call;
  const subscription = streamsAsClient(sources, call).wsPush(group, method, variables, {
    studioRequestId: options.requestId,
  });
  options.signal.addEventListener("abort", () => subscription.close(), { once: true });
  return subscription;
};

/**
 * Open a channel this process only calls, as its own clients would.
 *
 * @param sources - The runtime's registered sources
 * @param call - The channel, and its variables
 * @param options - When to close, and the row Studio shows the channel under
 * @returns The channel, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchWS(socket, payload, sources, ac.signal, openChannelAsClient);
 * ```
 */
export const openChannelAsClient: ChannelOpener = async (sources, call, options) => {
  const { group, method, variables } = call;
  const channel = streamsAsClient(sources, call).wsChannel(group, method, variables, {
    studioRequestId: options.requestId,
  });
  options.signal.addEventListener("abort", () => channel.close(), { once: true });
  return channel;
};
