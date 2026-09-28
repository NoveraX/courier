import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import { qualifyTopic, unqualifyTopic } from "../realtime/ws/topic-key";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { runTransportMiddleware } from "../utils/transport-middleware";
import { authorizeSubscription } from "./ws-authorize-subscription";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry, openSubscriptionEntry } from "./ws-dispatch-helpers";
import { startChannel, startPush } from "./ws-endpoints";
import { VALIDATION_FAILED, validateVariablesSafe } from "./ws-middleware";
import { resolveSubscribeTopic } from "./ws-resolve";
import { sendSubscriptionEnd } from "./ws-subscription-end";

const log = createLogger("WS");

/**
 * Handle a "subscribe" message from a WS client.
 *
 * Full flow: validate topic → check limits → resolve endpoint → validate
 * variables → run middleware → authorize → tell the client of a renamed
 * topic → start channel/push → send "subscribed".
 *
 * The "subscribed" confirmation is sent AFTER channel/push initialization:
 * the client holds its messages until it arrives, so none reaches the
 * channel before onJoin completes.
 *
 * @param ctx - Per-connection socket context
 * @param msg - Decoded WS message with type "subscribe"
 */
export async function handleSubscribe(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const topic = msg.topic;
  if (!topic) {
    ctx.sendMessage({ type: "error", id: msg.id, error: { code: 4400, message: "Missing topic" } });
    return;
  }

  /* A subscription takes its place when its subscribe arrives, not once it
     has been validated and authorized: the count was read before those
     awaits and updated after them, so every frame of a burst saw it as it
     was before the burst. */
  if (!hasPlace(ctx, topic)) {
    sendSubscriptionEnd(ctx, topic, msg.id, { code: 4429, message: "Too many subscriptions" });
    return;
  }
  const opening = openSubscription(ctx, msg, topic);
  ctx.subscribing.set(topic, opening);
  try {
    await opening;
  } finally {
    if (ctx.subscribing.get(topic) === opening) ctx.subscribing.delete(topic);
  }
}

/** Renewing a subscription the connection holds, or is opening, takes no new place. */
function hasPlace(ctx: WSSocketContext, topic: string): boolean {
  const renewing = ctx.topicManager.has(ctx.connectionId, topic) || ctx.subscribing.has(topic);
  const taken = ctx.topicManager.topicCount(ctx.connectionId) + ctx.subscribing.size;
  if (!renewing && taken >= ctx.maxSubscriptions) return false;
  return true;
}

async function openSubscription(
  ctx: WSSocketContext,
  msg: WSMessage,
  topic: string,
): Promise<void> {
  const resolved = resolveSubscribeTopic(ctx, msg, topic);
  if (!resolved) return;

  const variables = await validateVariablesSafe(ctx, msg, resolved.schema);
  if (variables === VALIDATION_FAILED) return;

  /* The client sends the topic already qualified with the key of its own
     variables, and the two were never checked against each other: a caller
     could pass validation and authorization with variables of its own while
     subscribing under the qualifier of someone else's. Derive the qualifier
     from what was validated instead of comparing — an honest client sends
     exactly this, and a dishonest one gets its own data. */
  const { baseTopic } = unqualifyTopic(topic);
  const subscribedTopic = qualifyTopic(baseTopic, variables);

  try {
    await runTransportMiddleware({
      transport: "ws",
      sources: ctx.sources,
      source: resolved.source,
      group: resolved.group,
      method: resolved.method,
      variables,
      request: ctx.request,
      requestId: ctx.requestId,
      timeoutMs: ctx.middlewareTimeoutMs,
    });
  } catch (error) {
    log.warn("Subscription middleware failed", error);
    sendSubscriptionEnd(ctx, topic, msg.id, describeFailure(error, "Subscription failed"));
    return;
  }
  if (ctx.closed) return;

  if (
    ctx.authorize &&
    !(await authorizeSubscription(ctx, msg, resolved, subscribedTopic, variables))
  )
    return;
  if (ctx.closed) return;

  /* Reconnect dedup: replace an existing subscription to the same topic, and
     only once this one is cleared to take its place — tearing it down before
     authorization would cost a working subscription to a failed re-subscribe. */
  if (ctx.topicManager.has(ctx.connectionId, subscribedTopic)) {
    await ctx.topicManager.unsubscribe(ctx.connectionId, subscribedTopic);
    closeSubscriptionEntry(ctx, subscribedTopic);
    if (ctx.closed) return;
  }

  /* Said before anything can arrive on the topic — onJoin's first send, a
     broadcast — so the client knows what those frames belong to. */
  if (subscribedTopic !== topic) {
    ctx.sendMessage({ type: "renamed", id: msg.id, topic, payload: subscribedTopic });
  }
  const subRequestId = openSubscriptionEntry(ctx, subscribedTopic, resolved);

  try {
    if (resolved.schema.bidirectional === true || resolved.schema.receive) {
      await startChannel(ctx, subscribedTopic, resolved.endpoint, variables, msg.id);
    } else {
      startPush(
        ctx,
        subscribedTopic,
        resolved.endpoint,
        variables,
        msg.id,
        resolved.schema.response,
      );
    }
  } catch (error) {
    // Rollback tracking on init failure; the endpoint logged the error.
    closeSubscriptionEntry(ctx, subscribedTopic, "error");
    sendSubscriptionEnd(ctx, topic, msg.id, describeFailure(error, "Subscription failed"));
    return;
  }
  if (ctx.closed) {
    closeSubscriptionEntry(ctx, subscribedTopic);
    return;
  }

  // Send "subscribed" AFTER channel/push init to prevent race
  ctx.sendMessage({ type: "subscribed", id: msg.id, topic: subscribedTopic });
  ctx.dt.onWSTrack?.({
    requestId: subRequestId,
    connectionId: ctx.connectionId,
    topic: subscribedTopic,
  });
}
