import type { ScopedLogger } from "../../logger";
import type { ConnectionState } from "../connection-state";
import { fromErrorCode, type RealtimeError } from "../errors";
import type { createMessageQueue } from "./message-queue";
import { unqualifyTopic } from "./topic-key";
import type { TopicRegistry } from "./topic-registry-types";
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
  log: ScopedLogger;
  /** Largest encoded message the server accepts */
  maxMessageSize: number;
  /** Hand a frame to the open socket; `false`, with a warning, when it could not */
  sendRaw(data: string): boolean;
}

/**
 * Subscribe to a topic. The server hears of it when the topic gains its
 * first subscriber and of its end when the last one leaves; a topic added
 * while not connected is subscribed when the connection opens.
 *
 * One `subscribe` and one `unsubscribe` go for all of a topic's
 * subscribers, so of two components on the same feed, the first to unmount
 * does not silence the other.
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
 *
 * @returns Whether the message went out or waits to; a message dropped —
 *   too large, no room left to hold it, the socket's buffer full, or the
 *   connection closed — is warned of, and one too large also fails the topic
 */
export function sendToTopic(ctx: TopicOpsContext, topic: string, payload: unknown): boolean {
  const serverTopic = ctx.topics.serverTopic(topic) ?? topic;
  const msg = encodeMessage({ type: "message", topic: serverTopic, payload });
  const refusal = oversized(ctx, msg);
  if (refusal) {
    ctx.log.warn(`Message not sent on ${topic}: ${refusal.message}`);
    ctx.topics.fail(topic, refusal);
    return false;
  }
  const outcome = ctx.topics.hold(topic, { payload });
  if (outcome === "held") return true;
  if (outcome === "dropped") return kept(ctx, false, `Message queue full for ${topic} — dropped`);
  if (ctx.state.current === "connected") return ctx.sendRaw(msg);
  if (ctx.state.current === "reconnecting" || ctx.state.current === "connecting") {
    return kept(ctx, ctx.queue.enqueue(msg), "Message queue full — dropped");
  }
  /* The connection gave up or was closed: nothing will ever send it. */
  return kept(ctx, false, `Message not sent on ${topic}: the connection is closed`);
}

/**
 * Why a message may not go out: larger than the server accepts. Sent, it
 * reached a server whose frame limit closed the whole socket over it, or was
 * refused there after crossing the network.
 */
function oversized(ctx: TopicOpsContext, frame: string): RealtimeError | undefined {
  if (frame.length <= ctx.maxMessageSize) return undefined;
  return fromErrorCode(
    4413,
    `Message too large: ${frame.length} characters, the limit is ${ctx.maxMessageSize}`,
  );
}

/* Whether a message was kept to go out; one that was not is warned of. */
function kept(ctx: TopicOpsContext, isKept: boolean, warning: string): boolean {
  if (!isKept) ctx.log.warn(warning);
  return isKept;
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
