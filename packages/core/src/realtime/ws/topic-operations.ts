import type { ScopedLogger } from "../../logger";
import { ConnectionError, fromErrorCode, type RealtimeError } from "../errors";
import type { ConnectionRuntime } from "./connection-runtime";
import type { MessageQueue } from "./message-queue";
import { unqualifyTopic } from "./topic-key";
import type { TopicRegistry } from "./topic-registry-types";
import type { Subscription } from "./topic-subscription";
import { encodeMessage } from "./ws-protocol";
import type { TopicHandler, TopicSubscriber } from "./ws-types";

/** What the topic operations of a connection work with. */
export interface TopicOpsContext {
  readonly runtime: ConnectionRuntime;
  readonly topics: TopicRegistry;
  readonly queue: MessageQueue<Subscription>;
  readonly log: ScopedLogger;
  /** Largest encoded message the server accepts */
  readonly maxMessageSize: number;
  /** Most the socket may hold unsent before a message is dropped */
  readonly maxBufferedAmount: number;
  /** Warn of a message the queue had no room for, once in a row of them */
  overflowed(topic: string): void;
}

/**
 * Subscribe to a topic. The server hears of it when the topic gains its
 * first subscriber and of its end when the last one leaves. A topic added
 * while there is no socket is subscribed when the next one opens, as every
 * subscription is: the registry is what the connection should be subscribed
 * to, made again on each socket, so nothing about subscriptions is queued.
 *
 * One `subscribe` and one `unsubscribe` go for all of a topic's
 * subscribers, so of two components on the same feed, the first to unmount
 * does not silence the other. A connection that has ended ends the
 * subscription at once, with why.
 */
export function subscribeToTopic(
  ctx: TopicOpsContext,
  topic: string,
  subscriber: TopicHandler | TopicSubscriber,
  variables?: unknown,
): () => void {
  const normalized = typeof subscriber === "function" ? { data: subscriber } : subscriber;
  const ended = endedWith(ctx);
  if (ended !== undefined) {
    queueMicrotask(() => normalized.end?.(ended));
    return () => undefined;
  }
  const membership = ctx.topics.add(topic, normalized, variables, unqualifyTopic(topic).baseTopic);
  if (membership.created && writable(ctx)) requestSubscription(ctx, topic, variables);
  return () => {
    const serverTopic = membership.leave();
    if (serverTopic && writable(ctx))
      ctx.runtime.send(encodeMessage({ type: "unsubscribe", topic: serverTopic }));
  };
}

/** Send the subscribe for a topic, with the id the server answers it by. */
export function requestSubscription(
  ctx: Pick<TopicOpsContext, "runtime" | "topics">,
  topic: string,
  variables: unknown,
): void {
  const id = ctx.topics.expect(topic);
  ctx.runtime.send(encodeMessage({ type: "subscribe", id, topic, payload: variables }));
}

/**
 * Send a fire-and-forget message to a topic. It goes out at once on a
 * subscription the server has confirmed, or with no subscription on an open
 * connection; otherwise it is kept until it can — sent before the server
 * confirms the subscription, it would reach a server still checking the
 * subscribe, and be refused as not subscribed.
 *
 * @returns Whether the message went out or waits to; a message dropped —
 *   too large, no room left to keep it, the socket's buffer full, or the
 *   connection ended — is warned of, and one too large also fails the topic
 */
export function sendToTopic(ctx: TopicOpsContext, topic: string, payload: unknown): boolean {
  const subscription = ctx.topics.subscriptionOf(topic);
  const frame = messageFrame(subscription?.topic ?? topic, payload);
  if (frame.length > ctx.maxMessageSize) {
    const refusal = fromErrorCode(
      4413,
      `Message too large: ${frame.length} characters, the limit is ${ctx.maxMessageSize}`,
    );
    ctx.log.warn(`Message not sent on ${topic}: ${refusal.message}`);
    ctx.topics.fail(topic, refusal);
    return false;
  }
  if (endedWith(ctx) !== undefined)
    return dropped(ctx, `Message not sent on ${topic}: the connection is closed`);
  const now = subscription
    ? subscription.confirmed
    : ctx.runtime.state.phase === "open" || ctx.runtime.state.phase === "reauthenticating";
  if (!now) {
    if (ctx.queue.push({ owner: subscription, topic, payload, bytes: frame.length })) return true;
    ctx.overflowed(topic);
    return false;
  }
  if (ctx.runtime.buffered > ctx.maxBufferedAmount)
    return dropped(ctx, `Message not sent on ${topic}: the socket's buffer is full`);
  return (
    ctx.runtime.send(frame) || dropped(ctx, `Message not sent on ${topic}: the socket is not open`)
  );
}

/**
 * The `message` frame for a topic, by the name the server knows it by now.
 *
 * @param topic - The topic, as the server knows its subscription
 * @param payload - What is sent
 * @returns The encoded frame
 */
export function messageFrame(topic: string, payload: unknown): string {
  return encodeMessage({ type: "message", topic, payload });
}

/* Why a connection that has ended takes nothing more: refused for good, or closed. */
function endedWith(ctx: Pick<TopicOpsContext, "runtime">): RealtimeError | undefined {
  const { state } = ctx.runtime;
  if (state.phase === "failed") return state.error;
  if (state.phase === "closed") return new ConnectionError("The connection is closed");
  return undefined;
}

/* Whether a frame handed over now goes on the socket: it is open, admitted or not. */
function writable(ctx: Pick<TopicOpsContext, "runtime">): boolean {
  const { phase } = ctx.runtime.state;
  return phase === "authenticating" || phase === "open" || phase === "reauthenticating";
}

function dropped(ctx: TopicOpsContext, warning: string): false {
  ctx.log.warn(warning);
  return false;
}
