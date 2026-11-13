import { getSources } from "@noverax/courier";

import type { TrustedCalls, TrustedCallsSocket } from "./connect-runtime-socket";
import { limitedResponderSocket } from "./limited-responder-socket";
import { type ResponderSocket, setupPlaygroundResponder } from "./playground-responder";
import { answerWebhookDeliveries } from "./webhook-responder";

/**
 * Answer the calls Studio sends only a runtime that showed it the
 * project's token, as a server's runtime does: the Playground's, run as
 * the application runs its calls, and the deliveries of the webhooks the
 * application defines, signed here. A page or a Worker never has the
 * token, so the browser build of the runtime carries none of this, nor
 * the server's half of the core it runs on.
 *
 * A Playground call's answer is sent after the events the call reported:
 * Studio names the agent a call ran for on its start, and forgets the call
 * once the answer arrives. The responder reads the live sources registry on
 * every call.
 *
 * @param on - The runtime's socket to Studio, the largest message Studio takes, and what sends the events reported so far
 * @returns What tells Studio again of the application's webhooks on each connection, and what stops answering
 * @example
 * ```ts
 * const trusted = answerTrustedCalls({ socket, limit, flushEvents: batches.flush });
 * socket.on("connect", trusted.connected);
 * ```
 */
export function answerTrustedCalls(on: TrustedCallsSocket): TrustedCalls {
  const { socket, limit, flushEvents } = on;
  const ordered: ResponderSocket = {
    on: (event, listener) => socket.on(event, listener),
    emit(event, payload) {
      flushEvents();
      socket.emit(event, payload);
    },
  };
  const stopPlayground = setupPlaygroundResponder(
    limitedResponderSocket(ordered, limit),
    () => getSources() ?? {},
  );
  const webhooks = answerWebhookDeliveries(socket);
  return {
    connected: webhooks.announce,
    stop() {
      stopPlayground();
      webhooks.stop();
    },
  };
}
