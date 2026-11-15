import { unqualifyTopic } from "../realtime/ws/topic-key";

/** Which connections subscribe to each topic, and which topics qualify each base topic. */
export interface TopicIndex {
  /** Count a connection among a topic's subscribers */
  add(topic: string, connectionId: string): void;
  /** Count it among them no more */
  remove(topic: string, connectionId: string): void;
  /** Whether a topic has a subscriber */
  has(topic: string): boolean;
  /** The connections subscribed to a topic — O(1), a ReadonlySet (zero-copy) */
  subscribers(topic: string): ReadonlySet<string>;
  /** The topics with a subscriber, qualified */
  topics(): string[];
  /** The qualified topics of a base topic that have a subscriber — O(1), a ReadonlySet (zero-copy) */
  byBase(baseTopic: string): ReadonlySet<string>;
  /** Topics with a subscriber, and the subscriptions to them */
  counts(): { readonly topics: number; readonly subscriptions: number };
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * The reverse indexes of a replica's subscriptions: each topic's
 * subscribers, and each base topic's qualified topics, so a broadcast finds
 * whom it reaches without a scan.
 *
 * @returns An index of no subscriptions
 * @example
 * ```ts
 * const index = createTopicIndex();
 * index.add('api.chat.room#{"room":"a"}', "conn-1");
 * index.byBase("api.chat.room"); // Set { 'api.chat.room#{"room":"a"}' }
 * ```
 */
export function createTopicIndex(): TopicIndex {
  /** Topic → the connections subscribed to it */
  const subscribers = new Map<string, Set<string>>();
  /** Base topic → its qualified topics */
  const qualifiedOf = new Map<string, Set<string>>();
  let subscriptions = 0;

  function add(topic: string, connectionId: string): void {
    let connections = subscribers.get(topic);
    if (!connections) {
      connections = new Set();
      subscribers.set(topic, connections);
      const { baseTopic } = unqualifyTopic(topic);
      let qualified = qualifiedOf.get(baseTopic);
      if (!qualified) {
        qualified = new Set();
        qualifiedOf.set(baseTopic, qualified);
      }
      qualified.add(topic);
    }
    if (!connections.has(connectionId)) {
      connections.add(connectionId);
      subscriptions++;
    }
  }

  function remove(topic: string, connectionId: string): void {
    const connections = subscribers.get(topic);
    if (!connections) return;
    if (connections.delete(connectionId)) subscriptions--;
    if (connections.size > 0) return;
    subscribers.delete(topic);
    const { baseTopic } = unqualifyTopic(topic);
    const qualified = qualifiedOf.get(baseTopic);
    if (!qualified) return;
    qualified.delete(topic);
    if (qualified.size === 0) qualifiedOf.delete(baseTopic);
  }

  return {
    add,
    remove,
    has: (topic) => subscribers.has(topic),
    subscribers: (topic) => subscribers.get(topic) ?? EMPTY_SET,
    topics: () => [...subscribers.keys()],
    byBase: (baseTopic) => qualifiedOf.get(baseTopic) ?? EMPTY_SET,
    counts: () => ({ topics: subscribers.size, subscriptions }),
  };
}
