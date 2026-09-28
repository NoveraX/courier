import { createLogger } from "../logger";
import type { PubSubAdapter } from "../realtime/adapters";
import { unqualifyTopic } from "../realtime/ws/topic-key";
import { createPubSubChannels } from "./pubsub-channels";
import type { InternalConnectionRegistry } from "./ws-registry-types";

const log = createLogger("WS");

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
 */
export interface PubSubBridge {
  /** Called when a connection subscribes to a topic locally */
  onTopicSubscribe(topic: string): Promise<void>;
  /** Called when a connection unsubscribes from a topic locally */
  onTopicUnsubscribe(topic: string): Promise<void>;
  /** Called when a connection opens locally */
  onConnectionOpen(): Promise<void>;
  /** Called when a connection closes locally */
  onConnectionClose(): Promise<void>;
  /** Tell the other replicas' subscribers of a topic */
  publishToTopic(topic: string, data: unknown): Promise<void>;
  /** Tell the other replicas' subscribers of every qualified topic of an endpoint */
  publishToBaseTopic(baseTopic: string, data: unknown): Promise<void>;
  /** Tell every connection of the other replicas */
  publishToAll(data: unknown): Promise<void>;
  /** Unsubscribe all pubsub subscriptions, await pending operations (shutdown) */
  destroy(): Promise<void>;
}

/**
 * Create a ref-counted bridge that syncs local topic subscriptions
 * with pubsub. Remote messages are forwarded to the local connections
 * they concern via the connection registry, which delivers locally only —
 * the replica that published has already delivered to its own.
 *
 * @param pubsub - PubSub adapter for cross-replica messaging
 * @param registry - Local connection registry for message delivery
 * @returns The bridge
 *
 * @example
 * const bridge = createPubSubBridge(pubsub, registry);
 * await bridge.onTopicSubscribe('api.chat.room#{"room":"a"}');
 * await bridge.publishToTopic('api.chat.room#{"room":"a"}', { text: "hi" });
 */
export function createPubSubBridge(
  pubsub: PubSubAdapter,
  registry: InternalConnectionRegistry,
): PubSubBridge {
  const channels = createPubSubChannels(pubsub);

  /* A failed publish used to reject with no one awaiting it; it is logged,
     and the local delivery it went with stands. */
  async function publish(channel: string, data: unknown): Promise<void> {
    try {
      await pubsub.publish(channel, data);
    } catch (err) {
      log.warn(`Failed to publish pubsub topic: ${channel}`, err);
    }
  }

  return {
    async onTopicSubscribe(topic) {
      const { baseTopic } = unqualifyTopic(topic);
      await Promise.all([
        channels.retain(topic, (message) => void registry.broadcastToTopic(topic, message)),
        channels.retain(baseChannel(baseTopic), (message) => {
          void registry.broadcastToBaseTopic(baseTopic, message);
        }),
      ]);
    },
    async onTopicUnsubscribe(topic) {
      const { baseTopic } = unqualifyTopic(topic);
      await Promise.all([channels.release(topic), channels.release(baseChannel(baseTopic))]);
    },
    onConnectionOpen: () =>
      channels.retain(EVERY_CONNECTION, (message) => void registry.broadcast(message)),
    onConnectionClose: () => channels.release(EVERY_CONNECTION),
    publishToTopic: (topic, data) => publish(topic, data),
    publishToBaseTopic: (baseTopic, data) => publish(baseChannel(baseTopic), data),
    publishToAll: (data) => publish(EVERY_CONNECTION, data),
    destroy: () => channels.destroy(),
  };
}
