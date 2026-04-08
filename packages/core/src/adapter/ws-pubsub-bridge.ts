import { createLogger } from "../logger";
import type { PubSubAdapter } from "../realtime/adapters";
import type { InternalConnectionRegistry } from "./ws-registry";

const log = createLogger("WS");

/** Cleanup function returned by pubsub.subscribe */
type Unsubscribe = () => void;

/** Tracked pubsub subscription with reference count */
interface TrackedTopic {
  refCount: number;
  unsubscribe: Unsubscribe;
}

/**
 * Bridge between PubSubAdapter and ConnectionRegistry.
 * Manages ref-counted pubsub subscriptions per topic:
 * - First local subscriber → pubsub.subscribe(topic)
 * - Last local subscriber leaves → pubsub.unsubscribe(topic)
 * - Remote messages → registry.broadcastToTopic()
 */
export interface PubSubBridge {
  /** Called when a connection subscribes to a topic locally */
  onTopicSubscribe(topic: string): Promise<void>;
  /** Called when a connection unsubscribes from a topic locally */
  onTopicUnsubscribe(topic: string): Promise<void>;
  /** Unsubscribe all pubsub subscriptions, await pending operations (shutdown) */
  destroy(): Promise<void>;
}

/**
 * Create a ref-counted bridge that syncs local topic subscriptions
 * with pubsub. Remote messages are forwarded to all local connections
 * via the connection registry.
 *
 * @param pubsub - PubSub adapter for cross-replica messaging
 * @param registry - Local connection registry for message delivery
 */
export function createPubSubBridge(
  pubsub: PubSubAdapter,
  registry: InternalConnectionRegistry,
): PubSubBridge {
  const topics = new Map<string, TrackedTopic>();
  /** Pending subscribe operations — prevents duplicate pubsub.subscribe() */
  const pending = new Map<string, Promise<void>>();
  let destroyed = false;

  async function onTopicSubscribe(topic: string): Promise<void> {
    if (destroyed) return;

    // Wait for any in-flight subscribe to complete first
    const inflight = pending.get(topic);
    if (inflight) {
      await inflight;
      // After waiting, re-check — the topic may now be tracked
      const existing = topics.get(topic);
      if (existing) {
        existing.refCount++;
        return;
      }
    }

    const existing = topics.get(topic);
    if (existing) {
      existing.refCount++;
      return;
    }

    const promise = (async () => {
      try {
        const unsubscribe = await pubsub.subscribe(topic, (message) => {
          if (destroyed) return;
          void registry.broadcastToTopic(topic, message);
        });
        if (destroyed) {
          // Subscribed after destroy — immediately clean up
          try {
            unsubscribe();
          } catch {
            /* shutdown */
          }
          return;
        }
        topics.set(topic, { refCount: 1, unsubscribe });
      } catch (err) {
        log.warn(`Failed to subscribe pubsub topic: ${topic}`, err);
      } finally {
        pending.delete(topic);
      }
    })();

    pending.set(topic, promise);
    await promise;
  }

  async function onTopicUnsubscribe(topic: string): Promise<void> {
    // Wait for any in-flight subscribe to finish before unsubscribing
    const inflight = pending.get(topic);
    if (inflight) await inflight;

    const tracked = topics.get(topic);
    if (!tracked) return;

    tracked.refCount--;
    if (tracked.refCount > 0) return;

    topics.delete(topic);
    try {
      tracked.unsubscribe();
    } catch (err) {
      log.warn(`Failed to unsubscribe pubsub topic: ${topic}`, err);
    }
  }

  async function destroy(): Promise<void> {
    destroyed = true;

    // Wait for in-flight subscribes to finish before cleanup
    if (pending.size > 0) {
      await Promise.allSettled([...pending.values()]);
    }

    for (const [, tracked] of topics) {
      try {
        tracked.unsubscribe();
      } catch (err) {
        log.warn("PubSub unsubscribe failed during shutdown", err);
      }
    }
    topics.clear();
  }

  return { onTopicSubscribe, onTopicUnsubscribe, destroy };
}
