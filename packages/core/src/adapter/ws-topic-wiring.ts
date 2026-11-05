import type { PubSubBridge } from "./ws-pubsub-bridge";
import type { InternalConnectionRegistry } from "./ws-registry-types";
import type { TopicHistory } from "./ws-topic-history";
import { createTopicRetention, type TopicRetention } from "./ws-topic-retention";
import { createServerTopicManager, type ServerTopicManager } from "./ws-topics";

/** A handler's topics: who holds which, and those held for a subscriber that left. */
export interface HandlerTopics {
  readonly topicManager: ServerTopicManager;
  readonly retention: TopicRetention;
}

/**
 * The topics of a handler, wired: a topic gains its pub/sub channel with
 * its first subscriber and loses it, with its sequence and its history,
 * once the last has left — at once, or once it is no longer held for that
 * subscriber to come back, when the handler keeps history.
 *
 * @param registry - This replica's connections, which keep the topics' sequences
 * @param bridge - The replica's pub/sub bridge, when it has an adapter
 * @param history - The events kept to resume subscriptions from, when the handler keeps history
 * @returns The topic manager and the retention
 * @example
 * ```ts
 * const { topicManager, retention } = wireTopics(registry, bridge, history);
 * ```
 */
export function wireTopics(
  registry: InternalConnectionRegistry,
  bridge: PubSubBridge | undefined,
  history: TopicHistory | undefined,
): HandlerTopics {
  const letGo = (topic: string): void => {
    bridge?.onTopicUnsubscribe(topic);
    registry.forgetTopic(topic);
  };
  const retention = createTopicRetention(history?.limits, letGo);
  const topicManager = createServerTopicManager({
    onFirstSubscriber: (topic) => {
      if (!retention.reclaim(topic)) bridge?.onTopicSubscribe(topic);
    },
    onLastUnsubscriber: (topic) => {
      if (!retention.hold(topic)) letGo(topic);
    },
  });
  registry.setTopicManager(topicManager);
  return { topicManager, retention };
}
