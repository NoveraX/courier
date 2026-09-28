import type { ScopedLogger } from "../../logger";
import { fromErrorCode, type RealtimeError } from "../errors";
import { unqualifyTopic } from "./topic-key";
import type { TopicRegistry } from "./topic-registry-types";
import type { createPendingRegistry } from "./ws-pending";
import { encodeMessage, type WSMessage } from "./ws-protocol";

const INTERNAL_ERROR = 5000;

export interface MessageDispatchContext {
  log: ScopedLogger;
  topics: TopicRegistry;
  pending: ReturnType<typeof createPendingRegistry>;
  /** Send a raw frame back to the server */
  sendRaw(data: string): void;
  /** Trigger an out-of-band auth refresh */
  onAuthRequired(): void;
}

/**
 * Process a single incoming WS frame.
 *
 * Pure function aside from the side effects on the provided context
 * (registry dispatches, send-raw callbacks, log writes).
 */
export function dispatchIncomingMessage(ctx: MessageDispatchContext, msg: WSMessage): void {
  if (msg.type === "ping") {
    ctx.sendRaw(encodeMessage({ type: "pong" }));
    return;
  }
  if (msg.type === "pong") return;
  if (msg.type === "auth_required") {
    ctx.onAuthRequired();
    return;
  }
  if (msg.type === "renamed") {
    followRename(ctx, msg);
    return;
  }
  if (msg.type === "subscribed") {
    confirmSubscription(ctx, msg);
    return;
  }
  if (msg.type === "error" && msg.id && ctx.pending.reject(msg)) return;
  if ((msg.type === "data" || msg.type === "message") && msg.id && ctx.pending.has(msg.id)) {
    ctx.pending.resolve(msg);
    return;
  }
  // Only dispatch actual payload-bearing frames to topic subscribers.
  // Control frames (`subscribed`, `unsubscribed`) carry the topic but no
  // payload — dispatching them would deliver `undefined` to user handlers
  // and inflate Studio stream-event counts with phantom 0-byte messages.
  if (msg.topic && (msg.type === "data" || msg.type === "message")) {
    ctx.topics.dispatch(msg.topic, msg.payload);
    return;
  }
  if (msg.type === "complete" && msg.topic) {
    ctx.topics.end(msg.topic, failureOf(msg));
    return;
  }
  if (msg.type === "error") routeError(ctx, msg);
}

/**
 * The server subscribed the connection under another topic than the one
 * asked for — a default or a transform in its variables schema changed what
 * the topic is qualified from. Everything about the subscription comes on
 * that topic, and used to be dropped as unknown.
 */
function followRename(ctx: MessageDispatchContext, msg: WSMessage): void {
  const serverTopic = msg.payload;
  if (!msg.topic || typeof serverTopic !== "string") return;
  if (unqualifyTopic(serverTopic).baseTopic !== unqualifyTopic(msg.topic).baseTopic) {
    ctx.log.warn(`Ignored a rename of ${msg.topic} to another endpoint's topic`);
    return;
  }
  ctx.topics.rename(msg.topic, serverTopic);
}

/**
 * The server is running the subscription: what was held for it goes out. A
 * confirmation nobody waits for is a subscription the client left before the
 * server set it up, which the server would otherwise keep until the socket
 * closes.
 */
function confirmSubscription(ctx: MessageDispatchContext, msg: WSMessage): void {
  if (!msg.topic) return;
  const confirmation = ctx.topics.confirm(msg.topic, msg.id);
  if (!confirmation) {
    ctx.sendRaw(encodeMessage({ type: "unsubscribe", topic: msg.topic }));
    return;
  }
  const { topic, held } = confirmation;
  for (const { payload, id } of held) {
    ctx.sendRaw(
      encodeMessage({ type: "message", topic, payload, ...(id !== undefined && { id }) }),
    );
  }
}

/**
 * An error about a topic reaches its subscribers, which used to learn of
 * nothing: the client only logged it. Any other error is the connection's.
 */
function routeError(ctx: MessageDispatchContext, msg: WSMessage): void {
  const error = failureOf(msg) ?? fromErrorCode(INTERNAL_ERROR, "Unknown server error");
  if (msg.topic && ctx.topics.has(msg.topic)) {
    ctx.topics.fail(msg.topic, error);
    return;
  }
  ctx.log.error(`Server error: ${error.message}`);
}

function failureOf(msg: WSMessage): RealtimeError | undefined {
  if (!msg.error) return undefined;
  return fromErrorCode(msg.error.code, msg.error.message, msg.error.issues);
}
