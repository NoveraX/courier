import type { StreamFailure } from "../realtime/describe-failure";
import type { WSSocketContext } from "./ws-context";

/**
 * Tell the client the server ended its subscription to `topic` — failed with
 * `failure`, or finished when there is none.
 *
 * Without it the client could not tell a subscription the server refused,
 * failed or finished from one still running: a channel whose join was
 * rejected showed as connected, and reading a push that failed waited
 * forever. The client stops the subscription and does not renew it on
 * reconnect.
 *
 * @param ctx - Per-connection socket context
 * @param topic - The topic as the client subscribed to it
 * @param id - The id of the client's subscribe message, when it sent one
 * @param failure - Why the subscription ended, when it failed
 */
export function sendSubscriptionEnd(
  ctx: WSSocketContext,
  topic: string,
  id: string | undefined,
  failure?: StreamFailure,
): void {
  if (ctx.closed) return;
  ctx.sendMessage({
    type: "complete",
    topic,
    ...(id !== undefined && { id }),
    ...(failure && { error: failure }),
  });
}
