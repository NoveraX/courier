import type { ScopedLogger } from "../../logger";
import type { ConnectionState } from "../connection-state";
import type { createMessageQueue } from "./message-queue";
import { unqualifyTopic } from "./topic-hash";
import type { createPendingRegistry } from "./ws-pending";
import { encodeMessage } from "./ws-protocol";
import type { createTopicRegistry } from "./ws-topics";

/**
 * Shared context for the topic-level operations of a WS connection.
 *
 * Carries the mutable connection state plus the helpers needed to
 * actually send a frame, so the topic operations can run as plain
 * functions while preserving the closure-based ergonomics of the
 * original `createWSConnection` implementation.
 */
export interface TopicOpsContext {
  state: ConnectionState;
  topics: ReturnType<typeof createTopicRegistry>;
  queue: ReturnType<typeof createMessageQueue>;
  pending: ReturnType<typeof createPendingRegistry>;
  log: ScopedLogger;
  requestTimeout: number;
  sendRaw(data: string): void;
}

/**
 * Subscribe a handler to a topic. The first time a topic is added at
 * `connected` state we send the `subscribe` frame immediately; otherwise
 * the topic registry queues it and the open handler replays subscriptions
 * on reconnect.
 *
 * The returned unsubscribe also fires an `unsubscribe` frame so the server
 * can drop its end of the routing table.
 */
export function subscribeToTopic(
  ctx: TopicOpsContext,
  topic: string,
  handler: (p: unknown) => void,
  variables?: unknown,
): () => void {
  const { baseTopic } = unqualifyTopic(topic);
  const unsub = ctx.topics.add(topic, handler, variables, baseTopic);
  if (ctx.state.current === "connected") {
    ctx.sendRaw(encodeMessage({ type: "subscribe", topic, payload: variables }));
  }
  return () => {
    unsub();
    sendControl(ctx, encodeMessage({ type: "unsubscribe", topic }));
  };
}

/** Send a fire-and-forget message to a topic, queueing on backpressure */
export function sendToTopic(ctx: TopicOpsContext, topic: string, payload: unknown): void {
  const msg = encodeMessage({ type: "message", topic, payload });
  if (ctx.state.current === "connected") {
    ctx.sendRaw(msg);
    return;
  }
  if (ctx.state.current === "reconnecting" || ctx.state.current === "connecting") {
    if (!ctx.queue.enqueue(msg)) ctx.log.warn("Message queue full — dropped");
  }
}

/**
 * Force-enqueue a control message even under backpressure. Used for
 * subscribe/unsubscribe/auth which the server needs even if the user
 * payload queue is saturated.
 */
export function sendControl(ctx: TopicOpsContext, msg: string): void {
  if (ctx.state.current === "connected") {
    ctx.sendRaw(msg);
    return;
  }
  if (ctx.state.current === "reconnecting" || ctx.state.current === "connecting") {
    if (!ctx.queue.enqueue(msg)) ctx.log.warn("Control message queue full — dropped");
  }
}

/**
 * Send a message that expects a single response, returning a promise
 * resolved by the matching `data`/`message` frame from the server. Times
 * out after `ctx.requestTimeout` ms.
 */
export function requestResponse<TResult>(
  ctx: TopicOpsContext,
  topic: string,
  payload: unknown,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const id = ctx.pending.register(resolve as (v: unknown) => void, reject, ctx.requestTimeout);
    const msg = encodeMessage({ type: "message", topic, payload, id });
    if (ctx.state.current === "connected") {
      ctx.sendRaw(msg);
      return;
    }
    if (!ctx.queue.enqueue(msg)) reject(new Error("WS request dropped — queue full"));
  });
}
