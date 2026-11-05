import type { RefusalLog } from "../logger/refusal-log";
import type { PubSubAdapter, TopicLog } from "../realtime/adapters";
import { unqualifyTopic } from "../realtime/ws/topic-key";
import { createPubSubChannels } from "./pubsub-channels";
import type { InternalConnectionRegistry } from "./ws-registry-types";

/**
 * The channel a broadcast to every connection travels on. No topic can take
 * this name: a topic always names a source and an endpoint.
 */
const EVERY_CONNECTION = "*";

/** The channel a broadcast to every qualified topic of an endpoint travels on. */
function baseChannel(baseTopic: string): string {
  return `${baseTopic}#*`;
}

/**
 * Bridge between PubSubAdapter and ConnectionRegistry.
 * Manages ref-counted pubsub subscriptions per topic:
 * - First local subscriber → pubsub.subscribe(topic), and to its endpoint's
 *   channel for broadcasts to every qualified topic
 * - Last local subscriber leaves → pubsub.unsubscribe(topic)
 * - Remote messages → delivered to the local connections they concern
 * - With the adapter's log, a topic's events are numbered by it, and reach
 *   every replica, this one too
 */
export interface PubSubBridge {
  /** The adapter's log, which numbers each topic's events for every replica, when it keeps one */
  readonly log: TopicLog | undefined;
  /** Called when a topic gains its first local subscriber */
  onTopicSubscribe(topic: string): void;
  /** Called when a topic loses its last local subscriber */
  onTopicUnsubscribe(topic: string): void;
  /** Called when a connection opens locally */
  onConnectionOpen(): void;
  /** Called when a connection closes locally */
  onConnectionClose(): void;
  /**
   * Send an event of a topic to its subscribers on every replica, this
   * one's too: through the log, which numbers it for all of them, when the
   * adapter keeps one; otherwise numbered here for this replica's, and
   * published for the others to number
   */
  publishEvent(topic: string, data: unknown, exclude?: string): Promise<void>;
  /** Tell the other replicas' subscribers of every qualified topic of an endpoint */
  publishToBaseTopic(baseTopic: string, data: unknown): Promise<void>;
  /** Tell every connection of the other replicas */
  publishToAll(data: unknown): Promise<void>;
  /** Unsubscribe from every channel at once (shutdown) */
  destroy(): void;
}

/**
 * Create a ref-counted bridge that syncs local topic subscriptions
 * with pubsub. Remote messages are forwarded to the local connections
 * they concern via the connection registry, which delivers locally only —
 * the replica that published has already delivered to its own, but for an
 * event the log numbered, which every replica takes from the log.
 *
 * @param pubsub - PubSub adapter for cross-replica messaging
 * @param registry - Local connection registry for message delivery
 * @param refusals - The handler's log of refusals, for a publish the adapter refused
 * @returns The bridge
 *
 * @example
 * const bridge = createPubSubBridge(pubsub, registry, refusals);
 * bridge.onTopicSubscribe('api.chat.room#{"room":"a"}');
 * await bridge.publishEvent('api.chat.room#{"room":"a"}', { text: "hi" });
 */
export function createPubSubBridge(
  pubsub: PubSubAdapter,
  registry: InternalConnectionRegistry,
  refusals: RefusalLog,
): PubSubBridge {
  const channels = createPubSubChannels(pubsub);
  const { log } = pubsub;

  /* The adapter queues what it cannot send yet and rejects only once it is
     stopped; that is logged rather than left to reject with no one awaiting
     it, and the local delivery it went with stands. */
  async function publish(channel: string, data: unknown): Promise<void> {
    try {
      await pubsub.publish(channel, data);
    } catch (error) {
      refusals.warn({ event: "publish refused", code: "PUBSUB_STOPPED" }, error);
    }
  }

  async function append(topicLog: TopicLog, topic: string, data: unknown, exclude?: string) {
    try {
      await topicLog.append(topic, data, exclude);
    } catch (error) {
      refusals.warn({ event: "publish refused", code: "PUBSUB_STOPPED" }, error);
    }
  }

  return {
    log,
    onTopicSubscribe(topic) {
      const { baseTopic } = unqualifyTopic(topic);
      /* With a log, an event it did not number — from a replica without
         one, or `pubsub.publish` itself — has no place in the sequence. */
      channels.retain(topic, (message, logged) => {
        if (logged) registry.deliverLogged(topic, message, logged);
        else if (!log) void registry.broadcastToTopic(topic, message);
        else
          refusals.warn({
            event: "event not delivered",
            code: "UNLOGGED",
            fields: { endpoint: baseTopic },
          });
      });
      channels.retain(baseChannel(baseTopic), (message) => {
        void registry.broadcastToBaseTopic(baseTopic, message);
      });
    },
    onTopicUnsubscribe(topic) {
      const { baseTopic } = unqualifyTopic(topic);
      channels.release(topic);
      channels.release(baseChannel(baseTopic));
    },
    onConnectionOpen: () =>
      channels.retain(EVERY_CONNECTION, (message) => void registry.broadcast(message)),
    onConnectionClose: () => channels.release(EVERY_CONNECTION),
    async publishEvent(topic, data, exclude) {
      if (log) return append(log, topic, data, exclude);
      await Promise.all([registry.broadcastToTopic(topic, data, exclude), publish(topic, data)]);
    },
    publishToBaseTopic: (baseTopic, data) => publish(baseChannel(baseTopic), data),
    publishToAll: (data) => publish(EVERY_CONNECTION, data),
    destroy: () => channels.destroy(),
  };
}
