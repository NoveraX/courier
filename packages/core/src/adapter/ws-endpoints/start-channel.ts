import { createLogger } from "../../logger";
import { checkResponseNow } from "../../realtime/check-response-now";
import { describeFailure } from "../../realtime/describe-failure";
import { channelHandlersOf } from "../../realtime/implementation";
import type { ChannelHandlers, WSChannelContext } from "../../realtime/types";
import { unqualifyTopic } from "../../realtime/ws/topic-key";
import { WS_CODE } from "../../realtime/ws/ws-codes";
import type { WSSocketContext } from "../ws-context";
import { closeSubscriptionEntry, holdSubscription } from "../ws-dispatch-helpers";
import { sendSubscriptionEnd } from "../ws-subscription-end";
import type { SubscriptionOpening, WSSubscriptionEntry } from "../ws-types";
import { emitChannelMessage } from "./emit-channel-message";
import { reportHandlerFailure } from "./report-handler-failure";

const log = createLogger("WS");

/**
 * Start a bidirectional channel subscription (server ↔ client).
 * Creates the channel handlers via factory, registers subscription with onMessage,
 * then awaits onJoin. If onJoin throws, the subscription is rolled back.
 *
 * `onLeave` runs once for each `onJoin` called — one that threw, or is
 * still running, too. A subscription ended while it opens — the client left
 * it, or subscribed to the topic again, while what it missed was read or
 * `onJoin` ran — is done with: one ended before it joined runs neither,
 * what an `onJoin` it outlived sends or refuses is said to no one, the
 * refusal logged, and nothing it does reaches the subscription that took
 * its place.
 *
 * Error handling:
 * - Factory init throws → rethrown, no subscription registered
 * - onJoin throws → this subscription let go of, error rethrown so the outer
 *   `handleSubscribe` catch can close Studio's record of it and send the
 *   single error message to the client.
 * - onMessage throws → error sent to client for this topic; the channel goes on
 * - onLeave throws → logged, does not block cleanup
 * - ctx.send / ctx.broadcast of a value the response schema refuses → thrown
 *   where it was called, and nothing is sent
 *
 * @param ctx - Per-connection socket context
 * @param topic - Qualified topic string (e.g. 'api.chat.room#{"room":"a"}')
 * @param endpoint - Channel endpoint function (ChannelHandlers factory)
 * @param variables - Validated subscription variables
 * @param opening - Its subscribe's id, the response schema everything it
 *   sends is held to, what it was authorized as, Studio's record of it, and
 *   what sends it what it missed
 * @returns Whether the subscription is still open once it has joined: false
 *   when it was ended meanwhile — the client left it or subscribed again, or
 *   the channel closed it in `onJoin` — and has nothing more to say
 */
export async function startChannel(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
  opening: SubscriptionOpening = {},
): Promise<boolean> {
  const { subscribeId, responseSchema, authorized, record, resume = () => false } = opening;
  let recovered = false;
  const outbound = (data: unknown): unknown =>
    responseSchema ? checkResponseNow(responseSchema, data) : data;

  let handlers: ChannelHandlers;
  try {
    handlers = channelHandlersOf(endpoint, variables, unqualifyTopic(topic).baseTopic);
  } catch (error) {
    // Thrown on so the subscribe flow refuses the subscription once.
    log.warn("Channel handler init failed", error);
    throw error;
  }

  const ended = new AbortController();
  /* Whether onJoin was called: only then does onLeave follow it. */
  let joined = false;
  const channelCtx: WSChannelContext = {
    topic,
    variables,
    connectionId: ctx.connectionId,
    get meta() {
      return ctx.meta;
    },
    signal: ended.signal,
    get recovered() {
      return recovered;
    },
    send: (data) => {
      const payload = outbound(data);
      /* Ended, it reaches no one: the topic may be another subscription's by now. */
      if (ended.signal.aborted) return;
      ctx.sendMessage({ type: "data", topic, payload });
      emitChannelMessage(ctx, record, payload, "data");
    },
    broadcast: (t, data) => broadcastToTopic(ctx, t, outbound(data)),
    close: (code, reason) => {
      /* The subscription ends as well: an error frame alone would leave it
         running, and the client would only log "closed". */
      if (ended.signal.aborted) return;
      const failed = code !== undefined && code !== WS_CODE.NORMAL;
      const failure = failed ? { code, message: reason ?? "Channel closed" } : undefined;
      sendSubscriptionEnd(ctx, topic, subscribeId, failure);
      closeSubscriptionEntry(ctx, record, failed ? "error" : "complete");
      void ctx.topicManager.release(ctx.connectionId, entry);
    },
  };

  const entry: WSSubscriptionEntry = {
    topic,
    authorized,
    record,
    cleanup: async () => {
      ended.abort();
      if (!joined) return;
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
        reportHandlerFailure(ctx, topic, error, {
          refusal: "message refused",
          fault: "onMessage failed",
        });
        ctx.sendMessage({ type: "error", topic, error: describeFailure(error, "Handler error") });
      }
    },
  };
  holdSubscription(ctx, entry);

  /* Registered first, then sent what it missed once the adapter has taken the topic: a live
     event that comes meanwhile follows it. */
  recovered = await resume();
  /* Ended while that was read, it never joins, and so has nothing to leave. */
  if (ended.signal.aborted) return false;

  joined = true;
  try {
    await handlers.onJoin?.(channelCtx);
  } catch (error) {
    reportHandlerFailure(ctx, topic, error, {
      refusal: "subscription refused",
      fault: "onJoin failed",
    });
    if (ended.signal.aborted) return false;
    await ctx.topicManager.release(ctx.connectionId, entry);
    // Rethrow so handleSubscribe's outer catch closes Studio's record and
    // sends the error to the client. Sending here as well would duplicate
    // the error frame.
    throw error;
  }
  return !ended.signal.aborted;
}

/* To every subscriber of every replica but the sender, who is sent `skip`. */
function broadcastToTopic(ctx: WSSocketContext, topic: string, data: unknown): void {
  if (ctx.bridge) void ctx.bridge.publishEvent(topic, data, ctx.connectionId);
  else void ctx.registry.broadcastToTopic(topic, data, ctx.connectionId);
}
