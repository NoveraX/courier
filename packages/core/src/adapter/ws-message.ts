import type { WSMessage } from "../realtime/ws/ws-protocol";
import { resolveEndpoint } from "../utils/execute-resolve";
import { validateSchema } from "../validation";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry } from "./ws-dispatch-helpers";
import { parseTopic } from "./ws-resolve";

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
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4404, message: "Not subscribed" },
    });
    return;
  }

  const { source, group, method } = parseTopic(topic);
  const dataSource = source ? ctx.sources[source] : undefined;
  if (!dataSource) return;

  const { schema } = resolveEndpoint(dataSource as Record<string, unknown>, group, method);
  if (!schema?.receive) return;

  try {
    await validateSchema(schema.receive, msg.payload, "receive");
  } catch {
    if (ctx.closed) return;
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4422, message: "Invalid message payload" },
    });
    return;
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
    if (ctx.closed) return false;
    if (allowed === false) {
      ctx.sendMessage({
        type: "error",
        id: msg.id,
        error: { code: 4403, message: "Message rejected" },
      });
      return false;
    }
    return true;
  } catch {
    if (ctx.closed) return false;
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4403, message: "Message rejected" },
    });
    return false;
  }
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
