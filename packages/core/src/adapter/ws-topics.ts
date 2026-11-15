import { createLogger } from "../logger";
import { createTopicIndex } from "./ws-topic-index";
import type { WSSubscriptionEntry } from "./ws-types";

const log = createLogger("WS");

/** Optional lifecycle hooks for pub/sub bridge integration */
export interface TopicManagerHooks {
  /** Called when a topic gains its first local subscriber */
  onFirstSubscriber?: (topic: string) => void;
  /** Called once each time a topic loses its last local subscriber */
  onLastUnsubscriber?: (topic: string) => void;
}

/** Server-side topic manager — tracks subscriptions per connection */
export interface ServerTopicManager {
  /**
   * Register a subscription for a connection: one it replaces on the same topic is ended
   * @returns The subscription it took the place of, which it ends, if there was one
   */
  subscribe(connectionId: string, entry: WSSubscriptionEntry): WSSubscriptionEntry | undefined;
  /** End the subscription a connection holds to a topic */
  unsubscribe(connectionId: string, topic: string): Promise<void>;
  /**
   * End a subscription while it is the one its connection holds to its
   * topic: one that has taken its place since is left as it is
   */
  release(connectionId: string, entry: WSSubscriptionEntry): Promise<void>;
  /** Clean up all subscriptions for a disconnected connection */
  disconnectAll(connectionId: string): Promise<void>;
  /** Check if a connection is subscribed to a topic */
  has(connectionId: string, topic: string): boolean;
  /** Get subscription entry for a connection + topic */
  get(connectionId: string, topic: string): WSSubscriptionEntry | undefined;
  /** The subscriptions a connection holds, as they are now */
  entriesOf(connectionId: string): WSSubscriptionEntry[];
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
  /** Topics with a subscriber, and the subscriptions to them, every connection's together */
  counts(): { readonly topics: number; readonly subscriptions: number };
}

/**
 * Create a server-side topic manager for tracking WS subscriptions.
 * Each connection can subscribe to multiple topics; disconnectAll
 * ensures all cleanup handlers run on socket close.
 *
 * A connection holds one subscription to a topic, and what ends one ends
 * that one alone: the same topic can be subscribed again while the
 * subscription before it is still being ended — its generator finishing,
 * its `onJoin` refusing late — and whatever comes of the older one leaves
 * the newer one as it is. Each subscription's cleanup runs once, however
 * many ask for it — its client leaving it and its socket closing as it
 * runs — and while it runs the subscription is still held, so its
 * `onLeave` can reach the topic. Once it has run, the subscription is
 * forgotten once, and a topic it leaves without a subscriber is
 * announced once.
 *
 * @param hooks - Optional lifecycle hooks for pubsub bridge integration
 */
export function createServerTopicManager(hooks?: TopicManagerHooks): ServerTopicManager {
  const connections = new Map<string, Map<string, WSSubscriptionEntry>>();
  const index = createTopicIndex();
  /* Each subscription's cleanup, once it was asked for: whoever asks again waits for the same. */
  const ending = new WeakMap<WSSubscriptionEntry, Promise<void>>();

  function subscribe(
    connectionId: string,
    entry: WSSubscriptionEntry,
  ): WSSubscriptionEntry | undefined {
    const isFirst = !index.has(entry.topic);
    let topics = connections.get(connectionId);
    if (!topics) {
      topics = new Map();
      connections.set(connectionId, topics);
    }
    const replaced = topics.get(entry.topic);
    topics.set(entry.topic, entry);
    index.add(entry.topic, connectionId);
    if (isFirst) hooks?.onFirstSubscriber?.(entry.topic);
    /* Two subscribes to one topic can open side by side: the one replaced is ended, never left running. */
    if (replaced === undefined || replaced === entry) return undefined;
    end(replaced).catch((error: unknown) =>
      log.warn("A replaced subscription failed to end", error),
    );
    return replaced;
  }

  /* Its cleanup is asked for now, not a step later: what checks whether it has ended sees it has. */
  function end(entry: WSSubscriptionEntry): Promise<void> {
    let ended = ending.get(entry);
    if (!ended) {
      ended = (async () => entry.cleanup())();
      ending.set(entry, ended);
    }
    return ended;
  }

  async function release(connectionId: string, entry: WSSubscriptionEntry): Promise<void> {
    if (connections.get(connectionId)?.get(entry.topic) !== entry) return;
    try {
      await end(entry);
    } finally {
      forget(connectionId, entry);
    }
  }

  /* A subscription ended is held no more, unless another has taken its place meanwhile. */
  function forget(connectionId: string, entry: WSSubscriptionEntry): void {
    const topics = connections.get(connectionId);
    if (!topics || topics.get(entry.topic) !== entry) return;
    topics.delete(entry.topic);
    index.remove(entry.topic, connectionId);
    if (topics.size === 0) connections.delete(connectionId);
    if (!index.has(entry.topic)) hooks?.onLastUnsubscriber?.(entry.topic);
  }

  async function unsubscribe(connectionId: string, topic: string): Promise<void> {
    const entry = connections.get(connectionId)?.get(topic);
    if (entry) await release(connectionId, entry);
  }

  async function disconnectAll(connectionId: string): Promise<void> {
    const entries = [...(connections.get(connectionId)?.values() ?? [])];
    await Promise.allSettled(entries.map(end));
    /* One a release still ending has forgotten by now is not forgotten, or announced, again. */
    for (const entry of entries) forget(connectionId, entry);
  }

  return {
    subscribe,
    unsubscribe,
    release,
    disconnectAll,
    has: (connectionId, topic) => connections.get(connectionId)?.has(topic) ?? false,
    get: (connectionId, topic) => connections.get(connectionId)?.get(topic),
    entriesOf: (connectionId) => [...(connections.get(connectionId)?.values() ?? [])],
    topicCount: (connectionId) => connections.get(connectionId)?.size ?? 0,
    subscribers: (topic) => index.subscribers(topic),
    allTopics: () => index.topics(),
    topicsByBase: (baseTopic) => index.byBase(baseTopic),
    get size() {
      return connections.size;
    },
    counts: () => index.counts(),
  };
}
