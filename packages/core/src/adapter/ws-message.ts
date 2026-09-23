import { createLogger } from "../logger";
import { describeFailure, type StreamFailure } from "../realtime/describe-failure";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { resolveEndpoint } from "../utils/execute-resolve";
import { ValidationError, validateSchema } from "../validation";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry } from "./ws-dispatch-helpers";
import { parseTopic } from "./ws-resolve";

const log = createLogger("WS");
const MESSAGE_REJECTED = { code: 4403, message: "Message rejected" };

/**
 * Inbound WS message + unsubscribe handlers.
 *
 * Cover the post-handshake lifecycle: routing data into a channel's
 * onMessage, and tearing down a subscription on client request.
 */

/** Handle an incoming "message" — route to channel's onMessage */
export async function handleMessage(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const topic = msg.topic;
  if (!topic || !ctx.topicManager.has(ctx.connectionId, topic)) {
    refuseMessage(ctx, msg, { code: 4404, message: "Not subscribed" });
    return;
  }

  const { source, group, method } = parseTopic(topic);
  const dataSource = source ? ctx.sources[source] : undefined;
  if (!dataSource) return;

  const { schema } = resolveEndpoint(dataSource as Record<string, unknown>, group, method);

  /* A channel the caller may send on says so with `bidirectional`, whether or
     not it also declared a schema to check the payload against. Requiring the
     schema meant a channel typed with `.send<T>()` alone dropped every message
     in silence — no handler, no error, nothing to see. */
  if (!schema?.bidirectional && !schema?.receive) {
    refuseMessage(ctx, msg, { code: 4400, message: "Endpoint does not accept messages" });
    return;
  }

  if (schema.receive) {
    try {
      await validateSchema(schema.receive, msg.payload, "receive");
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      const failure = { code: 4422, message: "Invalid message payload", issues: error.issues };
      refuseMessage(ctx, msg, failure);
      return;
    }
  }
  if (ctx.closed) return;

  if (ctx.authorizeMessage && !(await authorizeIncomingMessage(ctx, msg, topic))) return;
  if (ctx.closed) return;

  ctx.seq.value++;
  emitStudioMessageEvent(ctx, topic, msg);

  const entry = ctx.topicManager.get(ctx.connectionId, topic);
  await entry?.onMessage?.(msg.payload);
}

/** Handle an "unsubscribe" message */
export async function handleUnsubscribe(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const topic = msg.topic;
  if (!topic) return;

  await ctx.topicManager.unsubscribe(ctx.connectionId, topic);
  if (ctx.closed) return;
  ctx.sendMessage({ type: "unsubscribed", id: msg.id, topic });
  closeSubscriptionEntry(ctx, topic, "complete");
}

/**
 * Run the per-message authorization hook. Sends a 4403 error and returns `false`
 * if the hook rejects or throws.
 */
async function authorizeIncomingMessage(
  ctx: WSSocketContext,
  msg: WSMessage,
  topic: string,
): Promise<boolean> {
  const authorizeMessage = ctx.authorizeMessage;
  if (!authorizeMessage) return true;
  try {
    const allowed = await authorizeMessage({
      connectionId: ctx.connectionId,
      meta: ctx.meta,
      topic,
      payload: msg.payload,
    });
    if (allowed === false) {
      refuseMessage(ctx, msg, MESSAGE_REJECTED);
      return false;
    }
    return true;
  } catch (error) {
    log.warn("Message authorization failed", error);
    refuseMessage(ctx, msg, describeFailure(error, MESSAGE_REJECTED.message, 4403));
    return false;
  }
}

/**
 * Refuse one message on a subscription, which goes on. The error names the
 * topic so the client's channel hears of it; it used to be logged only.
 */
function refuseMessage(ctx: WSSocketContext, msg: WSMessage, failure: StreamFailure): void {
  if (ctx.closed) return;
  ctx.sendMessage({
    type: "error",
    ...(msg.id !== undefined && { id: msg.id }),
    ...(msg.topic !== undefined && { topic: msg.topic }),
    error: failure,
  });
}

/** Emit a Studio onStreamMessage event for an inbound WS message (if hooked) */
function emitStudioMessageEvent(ctx: WSSocketContext, topic: string, msg: WSMessage): void {
  if (!ctx.dt.onStreamMessage) return;
  const sub = ctx.subscriptionIds.get(topic);
  const seq = sub ? ++sub.seq.value : ctx.seq.value;
  const json = typeof msg.payload === "string" ? msg.payload : JSON.stringify(msg.payload);
  ctx.dt.onStreamMessage({
    requestId: sub?.requestId ?? ctx.requestId,
    seq,
    eventType: "message",
    dataSize: json.length,
    dataPreview: json.length <= 512 ? json : `${json.slice(0, 512)}…`,
    timestamp: Date.now(),
  });
}
