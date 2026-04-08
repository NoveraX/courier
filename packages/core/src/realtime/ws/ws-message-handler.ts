import type { ScopedLogger } from "../../logger";
import type { createPendingRegistry } from "./ws-pending";
import { encodeMessage, type WSMessage } from "./ws-protocol";
import type { createTopicRegistry } from "./ws-topics";

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
  if (msg.type === "error" && msg.id) {
    ctx.pending.reject(msg);
    return;
  }
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
  }
  if (msg.type === "error") {
    ctx.log.error(`Server error: ${msg.error?.message ?? "unknown"}`);
  }
}
