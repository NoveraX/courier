import { createHeldMessages, type HeldMessages } from "./held-messages";
import type { MessageQueueConfig } from "./message-queue";
import type { TopicSubscriber } from "./ws-types";

/** One subscription on a connection, as the topic registry keeps it. */
export interface Subscription {
  /** The topic the server knows the subscription by */
  topic: string;
  baseTopic: string;
  variables?: unknown;
  subscribers: Set<TopicSubscriber>;
  /** Other topics it answers to: those the client asked for before the server renamed it */
  labels: Set<string>;
  confirmed: boolean;
  /** Id of the subscribe the server has yet to confirm */
  awaiting?: string | undefined;
  held: HeldMessages;
  /** Set once another subscription took over its subscribers */
  mergedInto?: Subscription;
}

/**
 * Create an unconfirmed subscription with no subscribers yet.
 *
 * @param topic - The topic asked for
 * @param variables - The subscription's variables
 * @param baseTopic - The topic without its qualifier; the topic itself when absent
 * @param messageQueue - Limits on what is held until the server confirms it
 * @returns The subscription
 *
 * @example
 * const s = createSubscription('api.chat.room#{"room":"a"}', { room: "a" }, "api.chat.room");
 */
export function createSubscription(
  topic: string,
  variables: unknown,
  baseTopic: string | undefined,
  messageQueue?: MessageQueueConfig,
): Subscription {
  return {
    topic,
    baseTopic: baseTopic ?? topic,
    variables,
    subscribers: new Set(),
    labels: new Set(),
    confirmed: false,
    held: createHeldMessages(messageQueue),
  };
}

/**
 * The subscription that now holds a subscriber first added to `s`, which
 * may since have been merged into another.
 *
 * @param s - The subscription the subscriber was added to
 * @returns The subscription it belongs to now
 *
 * @example
 * liveSubscription(merged) === target; // true once merged into target
 */
export function liveSubscription(s: Subscription): Subscription {
  let current = s;
  while (current.mergedInto) current = current.mergedInto;
  return current;
}

/**
 * Hand `from`'s subscribers and held messages over to `into`.
 *
 * @param from - The subscription merged away
 * @param into - The subscription that takes over
 * @returns How many held messages did not fit in `into` and were dropped
 *
 * @example
 * const dropped = mergeSubscription(asked, served);
 */
export function mergeSubscription(from: Subscription, into: Subscription): number {
  for (const subscriber of from.subscribers) into.subscribers.add(subscriber);
  from.subscribers.clear();
  from.mergedInto = into;
  return from.held.moveTo(into.held);
}
