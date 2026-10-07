import type { Sources } from "@noverax/courier/define";
import { PLAYGROUND_RID_HEADER, proxyStreamingFactories } from "@noverax/courier/internal";

import { proxyPathFor } from "./proxy-playground";
import type { ChannelOpener, StreamCall, StreamOpener } from "./responder-dispatch";

/* The app's proxy route, as the app's own clients open it, each stream
   naming the row Studio follows it under: SSE in a header, a WebSocket —
   whose upgrade carries none a browser could set — in its address. A
   socket carries the call's headers in its first frame, as a browser's
   proxy caller sends its own. */
function streamsThroughProxy(sources: Sources, call: StreamCall, requestId: string) {
  const definition: unknown = Reflect.get(sources, call.source);
  return proxyStreamingFactories(call.source, {
    sse: {
      proxyPath: proxyPathFor(definition, "sse"),
      headers: { ...call.headers, [PLAYGROUND_RID_HEADER]: requestId },
    },
    ws: {
      proxyPath: proxyPathFor(definition, "ws"),
      playgroundRequestId: requestId,
      headers: call.headers,
    },
  });
}

/**
 * Open an SSE stream through the app's proxy route, as the app's browser
 * would; the proxy shows it under the row Studio follows.
 *
 * @param sources - The runtime's registered sources
 * @param call - The stream, its variables and headers
 * @param options - When to stop, and the row Studio shows the stream under
 * @returns The subscription, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchSSE(socket, payload, sources, ac.signal, openStreamThroughProxy);
 * ```
 */
export const openStreamThroughProxy: StreamOpener = async (sources, call, options) => {
  const { group, method, variables } = call;
  const subscription = streamsThroughProxy(sources, call, options.requestId).sse(
    group,
    method,
    variables,
    {},
  );
  options.signal.addEventListener("abort", () => subscription.close(), { once: true });
  return subscription;
};

/**
 * Open a WebSocket push through the app's proxy route, as the app's
 * browser would; the proxy shows it under the row Studio follows.
 *
 * @param sources - The runtime's registered sources
 * @param call - The push, and its variables
 * @param options - When to stop, and the row Studio shows the push under
 * @returns The subscription, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchWSPush(socket, payload, sources, ac.signal, openPushThroughProxy);
 * ```
 */
export const openPushThroughProxy: StreamOpener = async (sources, call, options) => {
  const { group, method, variables } = call;
  const subscription = streamsThroughProxy(sources, call, options.requestId).wsPush(
    group,
    method,
    variables,
    {},
  );
  options.signal.addEventListener("abort", () => subscription.close(), { once: true });
  return subscription;
};

/**
 * Open a channel through the app's proxy route, as the app's browser
 * would; the proxy shows it under the row Studio follows.
 *
 * @param sources - The runtime's registered sources
 * @param call - The channel, and its variables
 * @param options - When to close, and the row Studio shows the channel under
 * @returns The channel, closed once the signal aborts
 * @example
 * ```ts
 * await dispatchWS(socket, payload, sources, ac.signal, openChannelThroughProxy);
 * ```
 */
export const openChannelThroughProxy: ChannelOpener = async (sources, call, options) => {
  const { group, method, variables } = call;
  const channel = streamsThroughProxy(sources, call, options.requestId).wsChannel(
    group,
    method,
    variables,
    {},
  );
  options.signal.addEventListener("abort", () => channel.close(), { once: true });
  return channel;
};
