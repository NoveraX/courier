import { createLogger } from "../../logger";

const log = createLogger("WS");

/**
 * In-process WS broadcast registry for the Studio Playground.
 *
 * Multiple playground tabs in the same process subscribe to the same WS
 * channel endpoint and need to broadcast between each other (e.g. testing
 * a chat). This registry maps a fully-qualified topic to its set of local
 * subscribers and provides O(1) broadcast.
 *
 * Scope is intentionally per-process — there is no cross-process IPC. For
 * production realtime, use the canonical WS adapter + Redis pubsub adapter.
 *
 * The registry is decoupled from any executor so tests can pass an isolated
 * instance via `ExecuteDirectWSChannelOptions.registry`.
 */

/** Per-subscriber emit handle stored in the topic set. */
export interface PlaygroundWSSubscriber {
  connectionId: string;
  emit: (data: unknown) => void;
}

/** Public registry contract */
export interface PlaygroundWSRegistry {
  /** Register a subscriber to a topic. Returns an unsubscribe function. */
  subscribe(topic: string, subscriber: PlaygroundWSSubscriber): () => void;
  /** Remove all subscriptions associated with a connectionId across all topics. */
  unsubscribeAll(connectionId: string): void;
  /**
   * Deliver `data` to every subscriber on `topic` except `excludeConnectionId`.
   * Mirrors canonical `broadcastToTopic` semantics (exclude sender).
   */
  broadcast(topic: string, data: unknown, excludeConnectionId?: string): void;
  /** Number of subscribers on a topic (for tests / metrics) */
  subscriberCount(topic: string): number;
  /**
   * Drop every subscription on every topic. Used by long-lived hosts on
   * studio socket disconnect to prevent dead-channel accumulation across
   * reconnect cycles. Subsequent `broadcast` calls become no-ops until
   * new `subscribe` calls populate the registry again.
   */
  clear(): void;
}

/** Create a fresh in-memory registry. */
export function createPlaygroundWSRegistry(): PlaygroundWSRegistry {
  const topics = new Map<string, Map<string, PlaygroundWSSubscriber>>();

  return {
    subscribe(topic, subscriber) {
      let bucket = topics.get(topic);
      if (!bucket) {
        bucket = new Map();
        topics.set(topic, bucket);
      }
      bucket.set(subscriber.connectionId, subscriber);
      return () => {
        const b = topics.get(topic);
        if (!b) return;
        b.delete(subscriber.connectionId);
        if (b.size === 0) topics.delete(topic);
      };
    },
    unsubscribeAll(connectionId) {
      for (const [topic, bucket] of topics) {
        if (bucket.delete(connectionId) && bucket.size === 0) {
          topics.delete(topic);
        }
      }
    },
    broadcast(topic, data, excludeConnectionId) {
      const bucket = topics.get(topic);
      if (!bucket) return;
      for (const sub of bucket.values()) {
        if (sub.connectionId === excludeConnectionId) continue;
        try {
          sub.emit(data);
        } catch (error) {
          // Subscriber emit must never break broadcast iteration. Log so
          // crashed listeners are debuggable rather than silently swallowed.
          log.warn(
            `Playground broadcast subscriber failed (topic=${topic}, conn=${sub.connectionId})`,
            error,
          );
        }
      }
    },
    subscriberCount(topic) {
      return topics.get(topic)?.size ?? 0;
    },
    clear() {
      topics.clear();
    },
  };
}

/**
 * Module-level shared registry. Used as the default when callers don't pass
 * their own. Lives for the lifetime of the JS process — fine for playground
 * use, never used in production wire paths.
 */
export const sharedPlaygroundWSRegistry: PlaygroundWSRegistry = createPlaygroundWSRegistry();
