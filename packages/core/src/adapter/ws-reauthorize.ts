import { authorizeSubscription } from "./ws-authorize-subscription";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry } from "./ws-dispatch-helpers";

/**
 * Authorize again each subscription a connection holds, once who it is
 * changed: credentials renewed as another user, or the same one with other
 * rights, must not keep what only the old ones were allowed. One the
 * connection may no longer hold ends as a refused subscribe does, with
 * 4403, and its handler's `onLeave` runs; the rest go on. The subscriptions
 * still being opened are waited for first, so none slips through authorized
 * as the connection was before.
 *
 * @param ctx - The connection, its metadata the new one
 * @example
 * ```ts
 * if (changed) await reauthorizeSubscriptions(ctx);
 * ```
 */
export async function reauthorizeSubscriptions(ctx: WSSocketContext): Promise<void> {
  if (!ctx.authorize) return;
  await Promise.allSettled([...ctx.subscribing.values()]);
  for (const entry of ctx.topicManager.entriesOf(ctx.connectionId)) {
    if (ctx.closed) return;
    const { authorized, topic } = entry;
    if (!authorized) continue;
    const msg = { type: "subscribe", topic } as const;
    if (await authorizeSubscription(ctx, msg, authorized, topic, authorized.variables)) continue;
    if (ctx.closed) return;
    await ctx.topicManager.unsubscribe(ctx.connectionId, topic);
    closeSubscriptionEntry(ctx, topic, "error");
  }
}
