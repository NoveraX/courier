import type { ScopedLogger } from "../../logger";
import type { ConnectionState } from "../connection-state";
import type { HeldMessage } from "./held-messages";
import type { createMessageQueue } from "./message-queue";
import { unqualifyTopic } from "./topic-key";
import type { TopicRegistry } from "./topic-registry-types";
import type { createPendingRegistry } from "./ws-pending";
import { encodeMessage } from "./ws-protocol";
import type { TopicHandler, TopicSubscriber } from "./ws-types";

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
  topics: TopicRegistry;
  queue: ReturnType<typeof createMessageQueue>;
  pending: ReturnType<typeof createPendingRegistry>;
  log: ScopedLogger;
  requestTimeout: number;
  sendRaw(data: string): void;
}

/**
 * Subscribe to a topic. The server hears of it when the topic gains its
 * first subscriber and of its end when the last one leaves; a topic added
 * while not connected is subscribed when the connection opens.
 *
 * Every subscriber used to send its own `subscribe`, and every one that left
 * an `unsubscribe` — so of two components on the same feed, the first to
 * unmount silenced the other.
 */
export function subscribeToTopic(
  ctx: TopicOpsContext,
  topic: string,
  subscriber: TopicHandler | TopicSubscriber,
  variables?: unknown,
): () => void {
  const { baseTopic } = unqualifyTopic(topic);
  const normalized = typeof subscriber === "function" ? { data: subscriber } : subscriber;
  const membership = ctx.topics.add(topic, normalized, variables, baseTopic);
  if (membership.created && ctx.state.current === "connected") {
    requestSubscription(ctx, topic, variables);
  }
  return () => {
    const serverTopic = membership.leave();
    if (serverTopic) sendControl(ctx, encodeMessage({ type: "unsubscribe", topic: serverTopic }));
  };
}

/**
 * Send the subscribe for a topic, with an id the server answers it by. The
 * topic's messages are held until the server confirms it.
 *
 * @param ctx - The topic registry and the raw sender of an open socket
 * @param topic - The topic to subscribe to
 * @param variables - The subscription's variables
 */
export function requestSubscription(
  ctx: Pick<TopicOpsContext, "topics" | "sendRaw">,
  topic: string,
  variables: unknown,
): void {
  const id = ctx.topics.expect(topic);
  ctx.sendRaw(encodeMessage({ type: "subscribe", id, topic, payload: variables }));
}

/**
 * Send a fire-and-forget message to a topic. Until the server confirms the
 * topic's subscription the message is held: sent at once, it reached a
 * server still validating and authorizing the subscribe, and was refused as
 * "Not subscribed". Otherwise it is queued while (re)connecting.
 */
export function sendToTopic(ctx: TopicOpsContext, topic: string, payload: unknown): void {
  if (holdUntilConfirmed(ctx, topic, { payload })) return;
  const serverTopic = ctx.topics.serverTopic(topic) ?? topic;
  const msg = encodeMessage({ type: "message", topic: serverTopic, payload });
  if (ctx.state.current === "connected") {
    ctx.sendRaw(msg);
    return;
  }
  if (ctx.state.current === "reconnecting" || ctx.state.current === "connecting") {
    if (!ctx.queue.enqueue(msg)) ctx.log.warn("Message queue full — dropped");
  }
}

/** Whether the message was held, or dropped for want of room, instead of going out. */
function holdUntilConfirmed(ctx: TopicOpsContext, topic: string, message: HeldMessage): boolean {
  const outcome = ctx.topics.hold(topic, message);
  if (outcome === "dropped") ctx.log.warn(`Message queue full for ${topic} — dropped`);
  return outcome !== "open";
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
 * out after `ctx.requestTimeout` ms. Held, as any message, until the
 * topic's subscription is confirmed.
 */
export function requestResponse<TResult>(
  ctx: TopicOpsContext,
  topic: string,
  payload: unknown,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const id = ctx.pending.register(resolve as (v: unknown) => void, reject, ctx.requestTimeout);
    const outcome = ctx.topics.hold(topic, { payload, id });
    if (outcome === "held") return;
    const serverTopic = ctx.topics.serverTopic(topic) ?? topic;
    const msg = encodeMessage({ type: "message", topic: serverTopic, payload, id });
    if (outcome === "open" && ctx.state.current === "connected") {
      ctx.sendRaw(msg);
      return;
    }
    if (outcome === "dropped" || !ctx.queue.enqueue(msg)) {
      reject(new Error("WS request dropped — queue full"));
    }
  });
}
