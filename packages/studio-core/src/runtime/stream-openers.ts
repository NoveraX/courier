import type { Sources } from "@noverax/courier/define";
import {
  executeDirectSSE,
  executeDirectWSChannel,
  executeDirectWSPush,
  servedHere,
} from "@noverax/courier/internal-streams";

import { openChannelAsClient, openPushAsClient, openStreamAsClient } from "./client-openers";
import type { PlaygroundExecutePayload } from "./playground-payloads";
import {
  openChannelThroughProxy,
  openPushThroughProxy,
  openStreamThroughProxy,
} from "./proxy-openers";
import type { ChannelOpener, StreamOpener } from "./responder-dispatch";

/** What a run opens an SSE stream, a WebSocket push and a channel with. */
export interface StreamOpeners {
  sse: StreamOpener;
  push: StreamOpener;
  channel: ChannelOpener;
}

/**
 * How a run opens a stream, as the app itself would: through the app's
 * proxy route in proxy mode; here, when this process serves the endpoint;
 * otherwise as a client, at the upstream that serves it.
 *
 * @param sources - The runtime's registered sources
 * @param payload - The run
 * @returns The openers for the run's mode and endpoint
 * @example
 * ```ts
 * await dispatchSSE(socket, payload, sources, ac.signal, streamOpenersFor(sources, payload).sse);
 * ```
 */
export function streamOpenersFor(
  sources: Sources,
  payload: PlaygroundExecutePayload,
): StreamOpeners {
  if (payload.mode === "proxy") {
    return {
      sse: openStreamThroughProxy,
      push: openPushThroughProxy,
      channel: openChannelThroughProxy,
    };
  }
  if (servedHere(sources, payload)) {
    return { sse: executeDirectSSE, push: executeDirectWSPush, channel: executeDirectWSChannel };
  }
  return { sse: openStreamAsClient, push: openPushAsClient, channel: openChannelAsClient };
}
