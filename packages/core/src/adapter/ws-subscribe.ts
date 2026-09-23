import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import { qualifyTopic, unqualifyTopic } from "../realtime/ws/topic-hash";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { generateRequestId } from "../studio";
import { runTransportMiddleware } from "../utils/transport-middleware";
import { authorizeSubscription } from "./ws-authorize-subscription";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry, extractHeaders } from "./ws-dispatch-helpers";
import { startChannel, startPush } from "./ws-endpoints";
import { VALIDATION_FAILED, validateVariablesSafe } from "./ws-middleware";
import { resolveSubscribeTopic } from "./ws-resolve";
import { sendSubscriptionEnd } from "./ws-subscription-end";

const log = createLogger("WS");

/**
 * Handle a "subscribe" message from a WS client.
 *
 * Full flow: validate topic → check limits → resolve endpoint → validate
 * variables → run middleware → authorize → start channel/push → send
 * "subscribed".
 *
 * The "subscribed" confirmation is sent AFTER channel/push initialization
 * to prevent a race where the client sends a message before onJoin completes.
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

  if (ctx.topicManager.topicCount(ctx.connectionId) >= ctx.maxSubscriptions) {
    sendSubscriptionEnd(ctx, topic, msg.id, { code: 4429, message: "Too many subscriptions" });
    return;
  }

  const resolved = resolveSubscribeTopic(ctx, msg, topic);
  if (!resolved) return;

  const variables = await validateVariablesSafe(ctx, msg, resolved.schema);
  if (variables === VALIDATION_FAILED) return;

  /* The client sends the topic already qualified with a hash of its own
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

  // Set up per-subscription Studio tracking BEFORE channel/push init
  // so data emitted during onJoin is already tracked.
  //
  // Studio Playground proxy mode pre-allocates a requestId on the browser
  // side and forwards it via `?_playground_rid=<id>` on the upgrade URL.
  // Use it as the subscription requestId so events emitted by `dispatch`/
  // `instrumentSSE` correlate back to the playground tab. Production
  // browser connections never set this param and fall through to a fresh
  // server-generated id.
  /* Reconnect dedup: replace an existing subscription to the same topic, and
     only once this one is cleared to take its place — tearing it down before
     authorization would cost a working subscription to a failed re-subscribe. */
  if (ctx.topicManager.has(ctx.connectionId, subscribedTopic)) {
    await ctx.topicManager.unsubscribe(ctx.connectionId, subscribedTopic);
    closeSubscriptionEntry(ctx, subscribedTopic);
    if (ctx.closed) return;
  }

  const subRequestId = ctx.playgroundRequestId ?? generateRequestId();
  ctx.subscriptionIds.set(subscribedTopic, {
    requestId: subRequestId,
    seq: { value: 0 },
    t0: performance.now(),
  });

  ctx.dt.onStreamOpen?.({
    requestId: subRequestId,
    source: resolved.source,
    group: resolved.group,
    method: resolved.method,
    transport: "ws",
    mode: "proxy",
    timestamp: Date.now(),
    requestHeaders: extractHeaders(ctx.request.headers),
  });

  try {
    if (resolved.schema.bidirectional === true || resolved.schema.receive) {
      await startChannel(ctx, subscribedTopic, resolved.endpoint, variables, msg.id);
    } else {
      startPush(ctx, subscribedTopic, resolved.endpoint, variables, msg.id);
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
