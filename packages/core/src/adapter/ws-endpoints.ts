import { createLogger } from "../logger";
import type {
  ChannelHandlers,
  WSChannelContext,
  WSContext,
  WSPushHandler,
} from "../realtime/types";
import type { WSSocketContext } from "./ws-context";

const log = createLogger("WS");

/**
 * Start a push-only async generator subscription (server → client).
 * Iterates the endpoint's async generator and sends each yielded value
 * as a data message to the client. Registers subscription in topicManager.
 *
 * @param ctx - Per-connection socket context
 * @param topic - Qualified topic string (e.g. "api.chat.feed#abc")
 * @param endpoint - Push endpoint function (async generator factory)
 * @param variables - Validated subscription variables
 */
export function startPush(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
): void {
  const handler = endpoint as WSPushHandler<unknown, unknown>;
  const wsCtx: WSContext = { topic, variables, connectionId: ctx.connectionId, meta: ctx.meta };

  let generator: AsyncGenerator<unknown>;
  try {
    generator = handler(wsCtx);
  } catch (error) {
    log.warn("Push handler init failed", error);
    ctx.sendMessage({
      type: "error",
      topic,
      error: { code: 5000, message: "Subscription failed" },
    });
    return;
  }

  let cancelled = false;

  const iterate = async (): Promise<void> => {
    try {
      for await (const value of generator) {
        if (cancelled) break;
        ctx.seq.value++;
        ctx.sendMessage({ type: "data", topic, payload: value, seq: ctx.seq.value });
        emitChannelMessage(ctx, topic, value, "data");
      }
    } catch (error) {
      log.warn("Push generator failed", error);
      ctx.sendMessage({
        type: "error",
        topic,
        error: { code: 5000, message: "Subscription failed" },
      });
    }
  };

  ctx.topicManager.subscribe(ctx.connectionId, {
    topic,
    cleanup: () => {
      cancelled = true;
    },
  });

  iterate()
    .catch((err) => log.warn("Push generator failed", err))
    .finally(() => void ctx.topicManager.unsubscribe(ctx.connectionId, topic));
}

/**
 * Start a bidirectional channel subscription (server ↔ client).
 * Creates the channel handlers via factory, registers subscription with onMessage,
 * then awaits onJoin. If onJoin throws, the subscription is rolled back.
 *
 * Error handling:
 * - Factory init throws → code 5000, no subscription registered
 * - onJoin throws → topicManager unsubscribed, error rethrown so the outer
 *   `handleSubscribe` catch can run `closeSubscriptionEntry` (Studio
 *   tracking teardown) and send the single error message to the client.
 *   Doing both here would leak the `subscriptionIds` entry.
 * - onMessage throws → code 5000, error sent to client
 * - onLeave throws → logged, does not block cleanup
 *
 * @param ctx - Per-connection socket context
 * @param topic - Qualified topic string (e.g. "api.chat.room#abc")
 * @param endpoint - Channel endpoint function (ChannelHandlers factory)
 * @param variables - Validated subscription variables
 */
export async function startChannel(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
): Promise<void> {
  const factory = endpoint as (v: unknown) => ChannelHandlers;

  let handlers: ChannelHandlers;
  try {
    handlers = factory(variables);
  } catch (error) {
    log.warn("Channel handler init failed", error);
    ctx.sendMessage({
      type: "error",
      topic,
      error: { code: 5000, message: "Subscription failed" },
    });
    return;
  }

  const channelCtx: WSChannelContext = {
    topic,
    variables,
    connectionId: ctx.connectionId,
    meta: ctx.meta,
    send: (data) => {
      ctx.sendMessage({ type: "data", topic, payload: data });
      emitChannelMessage(ctx, topic, data, "data");
    },
    broadcast: (t, data) => broadcastToTopic(ctx, t, data),
    close: (code, reason) => {
      ctx.sendMessage({
        type: "error",
        topic,
        error: { code: code ?? 1000, message: reason ?? "closed" },
      });
    },
  };

  ctx.topicManager.subscribe(ctx.connectionId, {
    topic,
    cleanup: async () => {
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
        ctx.sendMessage({ type: "error", topic, error: { code: 5000, message: "Handler error" } });
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

/** Emit a studio stream message event for a channel send/broadcast */
function emitChannelMessage(
  ctx: WSSocketContext,
  topic: string,
  data: unknown,
  eventType: string,
): void {
  if (!ctx.dt.onStreamMessage) return;
  const sub = ctx.subscriptionIds.get(topic);
  const seq = sub ? ++sub.seq.value : ++ctx.seq.value;
  const json = typeof data === "string" ? data : JSON.stringify(data);
  ctx.dt.onStreamMessage({
    requestId: sub?.requestId ?? ctx.requestId,
    seq,
    eventType,
    dataSize: json.length,
    dataPreview: json.length <= 512 ? json : `${json.slice(0, 512)}…`,
    timestamp: Date.now(),
  });
}

function broadcastToTopic(ctx: WSSocketContext, topic: string, data: unknown): void {
  // Local delivery — all subscribers on this server (exclude sender)
  void ctx.registry.broadcastToTopic(topic, data, ctx.connectionId);
  // Remote delivery — all other replicas via pubsub (echo prevention built-in)
  ctx.pubsub?.publish(topic, data);
}
