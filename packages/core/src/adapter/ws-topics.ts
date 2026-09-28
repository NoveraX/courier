import { unqualifyTopic } from "../realtime/ws/topic-key";
import type { WSSubscriptionEntry } from "./ws-types";

/** Optional lifecycle hooks for pub/sub bridge integration */
export interface TopicManagerHooks {
  /** Called when a topic gains its first local subscriber */
  onFirstSubscriber?: (topic: string) => Promise<void>;
  /** Called when a topic loses its last local subscriber */
  onLastUnsubscriber?: (topic: string) => Promise<void>;
}

/** Server-side topic manager — tracks subscriptions per connection */
export interface ServerTopicManager {
  /** Register a subscription for a connection */
  subscribe(connectionId: string, entry: WSSubscriptionEntry): void;
  /** Unsubscribe a single topic for a connection */
  unsubscribe(connectionId: string, topic: string): Promise<void>;
  /** Clean up all subscriptions for a disconnected connection */
  disconnectAll(connectionId: string): Promise<void>;
  /** Check if a connection is subscribed to a topic */
  has(connectionId: string, topic: string): boolean;
  /** Get subscription entry for a connection + topic */
  get(connectionId: string, topic: string): WSSubscriptionEntry | undefined;
  /** Number of topics a connection is subscribed to */
  topicCount(connectionId: string): number;
  /** Get all connection IDs subscribed to a topic — O(1) via reverse index. Returns ReadonlySet (zero-copy). */
  subscribers(topic: string): ReadonlySet<string>;
  /** Get all active topic names (qualified) */
  allTopics(): string[];
  /** Get all qualified topics matching a base topic — O(1) via base index. Returns ReadonlySet (zero-copy). */
  topicsByBase(baseTopic: string): ReadonlySet<string>;
  /** Total active connections */
  readonly size: number;
}

/**
 * Create a server-side topic manager for tracking WS subscriptions.
 * Each connection can subscribe to multiple topics; disconnectAll
 * ensures all cleanup handlers run on socket close.
 *
 * @param hooks - Optional lifecycle hooks for pubsub bridge integration
 */
export function createServerTopicManager(hooks?: TopicManagerHooks): ServerTopicManager {
  const connections = new Map<string, Map<string, WSSubscriptionEntry>>();
  /** Reverse index: topic → Set of connectionIds — O(1) subscriber lookup */
  const topicIndex = new Map<string, Set<string>>();
  /** Base topic → Set of qualified topics — O(1) base→qualified lookup */
  const baseIndex = new Map<string, Set<string>>();

  function addToIndex(topic: string, connectionId: string): void {
    const isNewTopic = !topicIndex.has(topic);
    let conns = topicIndex.get(topic);
    if (!conns) {
      conns = new Set();
      topicIndex.set(topic, conns);
    }
    conns.add(connectionId);
    if (isNewTopic) {
      const { baseTopic } = unqualifyTopic(topic);
      let qualified = baseIndex.get(baseTopic);
      if (!qualified) {
        qualified = new Set();
        baseIndex.set(baseTopic, qualified);
      }
      qualified.add(topic);
    }
  }

  function removeFromIndex(topic: string, connectionId: string): void {
    const conns = topicIndex.get(topic);
    if (!conns) return;
    conns.delete(connectionId);
    if (conns.size === 0) {
      topicIndex.delete(topic);
      const { baseTopic } = unqualifyTopic(topic);
      const qualified = baseIndex.get(baseTopic);
      if (qualified) {
        qualified.delete(topic);
        if (qualified.size === 0) baseIndex.delete(baseTopic);
      }
    }
  }

  function subscribe(connectionId: string, entry: WSSubscriptionEntry): void {
    const isFirst = !topicIndex.has(entry.topic);
    let topics = connections.get(connectionId);
    if (!topics) {
      topics = new Map();
      connections.set(connectionId, topics);
    }
    topics.set(entry.topic, entry);
    addToIndex(entry.topic, connectionId);
    if (isFirst) void hooks?.onFirstSubscriber?.(entry.topic);
  }

  async function unsubscribe(connectionId: string, topic: string): Promise<void> {
    const topics = connections.get(connectionId);
    const entry = topics?.get(topic);
    if (!entry || !topics) return;

    await entry.cleanup();
    topics.delete(topic);
    removeFromIndex(topic, connectionId);
    if (topics.size === 0) connections.delete(connectionId);
    if (!topicIndex.has(topic)) await hooks?.onLastUnsubscriber?.(topic);
  }

  async function disconnectAll(connectionId: string): Promise<void> {
    const topics = connections.get(connectionId);
    if (!topics) return;

    const topicNames = [...topics.keys()];
    const cleanups = [...topics.values()].map((e) => e.cleanup());
    await Promise.allSettled(cleanups);
    connections.delete(connectionId);

    // Collect topics that lost their last subscriber, then run hooks in parallel
    const lastUnsubscribed: string[] = [];
    for (const topic of topicNames) {
      removeFromIndex(topic, connectionId);
      if (!topicIndex.has(topic)) lastUnsubscribed.push(topic);
    }
    const onLast = hooks?.onLastUnsubscriber;
    if (onLast && lastUnsubscribed.length > 0) {
      await Promise.allSettled(lastUnsubscribed.map((t) => onLast(t)));
    }
  }

  function has(connectionId: string, topic: string): boolean {
    return connections.get(connectionId)?.has(topic) ?? false;
  }

  function get(connectionId: string, topic: string): WSSubscriptionEntry | undefined {
    return connections.get(connectionId)?.get(topic);
  }

  const EMPTY_SET: ReadonlySet<string> = new Set();

  function subscribers(topic: string): ReadonlySet<string> {
    return topicIndex.get(topic) ?? EMPTY_SET;
  }

  function allTopics(): string[] {
    return [...topicIndex.keys()];
  }

  function topicCount(connectionId: string): number {
    return connections.get(connectionId)?.size ?? 0;
  }

  function topicsByBase(baseTopic: string): ReadonlySet<string> {
    return baseIndex.get(baseTopic) ?? EMPTY_SET;
  }

  return {
    subscribe,
    unsubscribe,
    disconnectAll,
    has,
    get,
    topicCount,
    subscribers,
    allTopics,
    topicsByBase,
    get size() {
      return connections.size;
    },
  };
}
