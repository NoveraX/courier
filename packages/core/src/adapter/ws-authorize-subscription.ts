import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import { sendSubscriptionEnd } from "./ws-subscription-end";

const log = createLogger("WS");
const REJECTED = { code: 4403, message: "Subscription rejected" };

/**
 * Run authorization check for a subscription.
 * Wraps `ctx.authorize` in a timeout race; ends the subscription with a 4403
 * on rejection or failure — or with the `RealtimeError` the hook threw — and
 * returns `false` so the caller can short-circuit.
 */
export async function authorizeSubscription(
  ctx: WSSocketContext,
  msg: WSMessage,
  resolved: { source: string; group?: string | undefined; method: string },
  topic: string,
  variables: unknown,
): Promise<boolean> {
  const authorize = ctx.authorize;
  if (!authorize) return true;
  let authTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const allowed = await Promise.race([
      authorize({
        connectionId: ctx.connectionId,
        meta: ctx.meta,
        source: resolved.source,
        group: resolved.group,
        method: resolved.method,
        topic,
        variables,
      }),
      new Promise<never>((_, reject) => {
        authTimer = setTimeout(
          () => reject(new Error("Authorize timeout")),
          ctx.middlewareTimeoutMs,
        );
      }),
    ]);
    if (allowed === false) {
      sendSubscriptionEnd(ctx, msg.topic ?? topic, msg.id, REJECTED);
      return false;
    }
    return true;
  } catch (error) {
    log.warn("Subscription authorization failed", error);
    const failure = describeFailure(error, REJECTED.message, REJECTED.code);
    sendSubscriptionEnd(ctx, msg.topic ?? topic, msg.id, failure);
    return false;
  } finally {
    clearTimeout(authTimer);
  }
}
