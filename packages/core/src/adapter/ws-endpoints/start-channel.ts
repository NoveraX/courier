import { createLogger } from "../../logger";
import { describeFailure } from "../../realtime/describe-failure";
import type { ChannelHandlers, WSChannelContext } from "../../realtime/types";
import type { WSSocketContext } from "../ws-context";
import { closeSubscriptionEntry } from "../ws-dispatch-helpers";
import { sendSubscriptionEnd } from "../ws-subscription-end";
import { emitChannelMessage } from "./emit-channel-message";

const log = createLogger("WS");

/**
 * Start a bidirectional channel subscription (server ↔ client).
 * Creates the channel handlers via factory, registers subscription with onMessage,
 * then awaits onJoin. If onJoin throws, the subscription is rolled back.
 *
 * Error handling:
 * - Factory init throws → rethrown, no subscription registered
 * - onJoin throws → topicManager unsubscribed, error rethrown so the outer
 *   `handleSubscribe` catch can run `closeSubscriptionEntry` (Studio
 *   tracking teardown) and send the single error message to the client.
 *   Doing both here would leak the `subscriptionIds` entry.
 * - onMessage throws → error sent to client for this topic; the channel goes on
 * - onLeave throws → logged, does not block cleanup
 *
 * @param ctx - Per-connection socket context
 * @param topic - Qualified topic string (e.g. "api.chat.room#abc")
 * @param endpoint - Channel endpoint function (ChannelHandlers factory)
 * @param variables - Validated subscription variables
 * @param subscribeId - The id of the client's subscribe message, if any
 */
export async function startChannel(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
  subscribeId?: string,
): Promise<void> {
  const factory = endpoint as (v: unknown) => ChannelHandlers;

  let handlers: ChannelHandlers;
  try {
    handlers = factory(variables);
  } catch (error) {
    // Thrown on so the subscribe flow refuses the subscription once.
    log.warn("Channel handler init failed", error);
    throw error;
  }

  const ended = new AbortController();
  const channelCtx: WSChannelContext = {
    topic,
    variables,
    connectionId: ctx.connectionId,
    meta: ctx.meta,
    signal: ended.signal,
    send: (data) => {
      ctx.sendMessage({ type: "data", topic, payload: data });
      emitChannelMessage(ctx, topic, data, "data");
    },
    broadcast: (t, data) => broadcastToTopic(ctx, t, data),
    close: (code, reason) => {
      /* Used to send an error frame and nothing else: the subscription
         went on, and the client only logged "closed". */
      if (ended.signal.aborted) return;
      const failed = code !== undefined && code !== 1000;
      const failure = failed ? { code, message: reason ?? "Channel closed" } : undefined;
      sendSubscriptionEnd(ctx, topic, subscribeId, failure);
      closeSubscriptionEntry(ctx, topic, failed ? "error" : "complete");
      void ctx.topicManager.unsubscribe(ctx.connectionId, topic);
    },
  };

  ctx.topicManager.subscribe(ctx.connectionId, {
    topic,
    cleanup: async () => {
      ended.abort();
      try {
        await handlers.onLeave?.(channelCtx);
      } catch (error) {
        log.warn("onLeave handler failed", error);
      }
    },
    onMessage: async (payload) => {
      try {
        await handlers.onMessage(channelCtx, payload);
      } catch (error) {
        log.warn("onMessage handler failed", error);
        ctx.sendMessage({ type: "error", topic, error: describeFailure(error, "Handler error") });
      }
    },
  });

  try {
    await handlers.onJoin?.(channelCtx);
  } catch (error) {
    log.warn("onJoin handler failed", error);
    await ctx.topicManager.unsubscribe(ctx.connectionId, topic);
    // Rethrow so handleSubscribe's outer catch runs closeSubscriptionEntry
    // and sends the error to the client. Sending here would either leak the
    // tracking entry or duplicate the error frame.
    throw error;
  }
}

function broadcastToTopic(ctx: WSSocketContext, topic: string, data: unknown): void {
  // Local delivery — all subscribers on this server (exclude sender)
  void ctx.registry.broadcastToTopic(topic, data, ctx.connectionId);
  // Remote delivery — all other replicas via pubsub (echo prevention built-in)
  void ctx.bridge?.publishToTopic(topic, data);
}
