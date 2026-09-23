import type { RealtimeError } from "../errors";
import type { TopicSubscriber } from "./ws-types";

/** Entry returned by `entries()` for reconnection with variables */
export interface TopicEntry {
  qualifiedTopic: string;
  baseTopic: string;
  variables?: unknown;
}

/** Internal topic subscription registry with message routing */
export interface TopicRegistry {
  /**
   * Add a subscriber for a topic. Returns its removal, which answers whether
   * it was the topic's last subscriber — the moment to tell the server.
   */
  add(
    topic: string,
    subscriber: TopicSubscriber,
    variables?: unknown,
    baseTopic?: string,
  ): () => boolean;
  /** Whether anyone is subscribed to a topic. */
  has(topic: string): boolean;
  /** Route an incoming message payload to all subscribers of a topic. */
  dispatch(topic: string, payload: unknown): void;
  /** Tell a topic's subscribers of an error on it; the subscription goes on. */
  fail(topic: string, error: RealtimeError): void;
  /** End a topic for its subscribers and forget it, so a reconnect does not renew it. */
  end(topic: string, error: RealtimeError | undefined): void;
  /** End every topic, as `end` does. */
  endAll(error: RealtimeError | undefined): void;
  /** Get all currently subscribed topics (for re-subscribe after reconnect). */
  topics(): string[];
  /** Get all entries with variables metadata for reconnection. */
  entries(): TopicEntry[];
}

/**
 * Create a topic subscription registry for WS message routing.
 * Maps topic strings to sets of subscribers for fan-out delivery.
 *
 * @returns TopicRegistry instance
 *
 * @example
 * const registry = createTopicRegistry();
 * const remove = registry.add("chat:room", { data: (d) => console.log(d) });
 * registry.dispatch("chat:room", { text: "hello" }); // logs { text: "hello" }
 * remove(); // true — the topic has no subscribers left
 */
export function createTopicRegistry(): TopicRegistry {
  const subscribers = new Map<string, Set<TopicSubscriber>>();
  const meta = new Map<string, { baseTopic: string; variables?: unknown }>();

  function forget(topic: string): Set<TopicSubscriber> | undefined {
    const set = subscribers.get(topic);
    subscribers.delete(topic);
    meta.delete(topic);
    return set;
  }

  function end(topic: string, error: RealtimeError | undefined): void {
    const set = forget(topic);
    if (!set) return;
    const ended = [...set];
    set.clear();
    for (const subscriber of ended) subscriber.end?.(error);
  }

  return {
    add(topic, subscriber, variables?, baseTopic?) {
      let set = subscribers.get(topic);
      if (!set) {
        set = new Set();
        subscribers.set(topic, set);
        meta.set(topic, { baseTopic: baseTopic ?? topic, variables });
      }
      set.add(subscriber);
      const own = set;

      return () => {
        /* A topic that already ended, or was renewed by someone else since,
           is not this subscriber's to let go. */
        if (!own.delete(subscriber) || own.size > 0) return false;
        if (subscribers.get(topic) === own) forget(topic);
        return true;
      };
    },

    has(topic) {
      return subscribers.has(topic);
    },

    dispatch(topic, payload) {
      for (const subscriber of subscribers.get(topic) ?? []) subscriber.data(payload);
    },

    fail(topic, error) {
      for (const subscriber of subscribers.get(topic) ?? []) subscriber.error?.(error);
    },

    end,

    endAll(error) {
      for (const topic of [...subscribers.keys()]) end(topic, error);
    },

    topics() {
      return [...subscribers.keys()];
    },

    entries() {
      return [...meta.entries()].map(([qualifiedTopic, m]) => ({
        qualifiedTopic,
        baseTopic: m.baseTopic,
        variables: m.variables,
      }));
    },
  };
}
