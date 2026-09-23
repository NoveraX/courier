import type { ScopedLogger } from "../../logger";
import { fromErrorCode, type RealtimeError } from "../errors";
import type { createPendingRegistry } from "./ws-pending";
import { encodeMessage, type WSMessage } from "./ws-protocol";
import type { createTopicRegistry } from "./ws-topics";

const INTERNAL_ERROR = 5000;

export interface MessageDispatchContext {
  log: ScopedLogger;
  topics: ReturnType<typeof createTopicRegistry>;
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
