import type { TopicHandler } from "./ws-types";

/** Entry returned by `entries()` for reconnection with variables */
export interface TopicEntry {
  qualifiedTopic: string;
  baseTopic: string;
  variables?: unknown;
}

/** Internal topic subscription registry with message routing */
export interface TopicRegistry {
  /** Add a handler for a topic. Returns unsubscribe function. */
  add(topic: string, handler: TopicHandler, variables?: unknown, baseTopic?: string): () => void;
  /** Route an incoming message payload to all handlers of a topic. */
  dispatch(topic: string, payload: unknown): void;
  /** Get all currently subscribed topics (for re-subscribe after reconnect). */
  topics(): string[];
  /** Get all entries with variables metadata for reconnection. */
  entries(): TopicEntry[];
  /** Remove all subscriptions. */
  clear(): void;
}

/**
 * Create a topic subscription registry for WS message routing.
 * Maps topic strings to sets of handlers for fan-out delivery.
 *
 * @returns TopicRegistry instance
 *
 * @example
 * const registry = createTopicRegistry();
 * const unsub = registry.add("chat:room", (data) => console.log(data));
 * registry.dispatch("chat:room", { text: "hello" }); // logs { text: "hello" }
 * unsub();
 */
export function createTopicRegistry(): TopicRegistry {
  const handlers = new Map<string, Set<TopicHandler>>();
  const meta = new Map<string, { baseTopic: string; variables?: unknown }>();

  return {
    add(topic, handler, variables?, baseTopic?) {
      let set = handlers.get(topic);
      if (!set) {
        set = new Set();
        handlers.set(topic, set);
        meta.set(topic, { baseTopic: baseTopic ?? topic, variables });
      }
      set.add(handler);

      return () => {
        set?.delete(handler);
        if (set?.size === 0) {
          handlers.delete(topic);
          meta.delete(topic);
        }
      };
    },

    dispatch(topic, payload) {
      const set = handlers.get(topic);
      if (!set) return;
      for (const handler of set) handler(payload);
    },

    topics() {
      return [...handlers.keys()];
    },

    entries() {
      return [...meta.entries()].map(([qualifiedTopic, m]) => ({
        qualifiedTopic,
        baseTopic: m.baseTopic,
        variables: m.variables,
      }));
    },

    clear() {
      handlers.clear();
      meta.clear();
    },
  };
}
