import type { RealtimeError } from "../errors";
import type { TopicRegistry } from "./topic-registry-types";
import {
  createSubscription,
  liveSubscription,
  mergeSubscription,
  type Subscription,
} from "./topic-subscription";
import type { TopicSubscriber } from "./ws-types";

export type {
  Confirmation,
  TopicEntry,
  TopicMembership,
  TopicRegistry,
} from "./topic-registry-types";

/** Options for a topic registry. */
export interface TopicRegistryOptions {
  /** A subscription ended or was let go: what it kept to send is dropped */
  onForget?: ((subscription: Subscription) => void) | undefined;
  /** The server took two subscriptions for one: what `from` kept to send goes with `into` */
  onMerge?: ((from: Subscription, into: Subscription) => void) | undefined;
}

/**
 * Create a topic subscription registry for WS message routing: subscribers
 * per topic for fan-out, and the name the server knows each subscription by.
 * It is the connection's desired state: every subscription in it is made
 * again on each socket the connection opens.
 *
 * @param options - Who hears of subscriptions let go and merged
 * @returns TopicRegistry instance
 *
 * @example
 * const registry = createTopicRegistry();
 * const membership = registry.add("chat:room", { data: (d) => console.log(d) });
 * registry.dispatch("chat:room", { text: "hello" }); // logs { text: "hello" }
 * membership.leave(); // "chat:room" — the topic has no subscribers left
 */
export function createTopicRegistry(options: TopicRegistryOptions = {}): TopicRegistry {
  const byTopic = new Map<string, Subscription>();
  const byLabel = new Map<string, Subscription>();
  const byId = new Map<string, Subscription>();
  let lastId = 0;

  const resolve = (topic: string) => byTopic.get(topic) ?? byLabel.get(topic);

  function wait(s: Subscription, id: string | undefined): void {
    if (s.awaiting !== undefined) byId.delete(s.awaiting);
    s.awaiting = id;
    s.confirmed = false;
    if (id !== undefined) byId.set(id, s);
  }

  function forget(s: Subscription): void {
    byTopic.delete(s.topic);
    for (const label of s.labels) byLabel.delete(label);
    if (s.awaiting !== undefined) byId.delete(s.awaiting);
    options.onForget?.(s);
  }

  function end(topic: string, error: RealtimeError | undefined): void {
    const s = resolve(topic);
    if (!s) return;
    forget(s);
    const ended = [...s.subscribers];
    s.subscribers.clear();
    for (const subscriber of ended) subscriber.end?.(error);
  }

  /* Two sets of variables the server's schema reads the same — one leaves
     out a default the other spells out — are one subscription to it, which
     the server replaces with the newer subscribe. */
  function merge(from: Subscription, into: Subscription): void {
    for (const label of [from.topic, ...from.labels]) {
      into.labels.add(label);
      byLabel.set(label, into);
    }
    mergeSubscription(from, into);
    options.onMerge?.(from, into);
    wait(into, from.awaiting);
  }

  const each = (topic: string, tell: (subscriber: TopicSubscriber) => void): void => {
    for (const subscriber of [...(resolve(topic)?.subscribers ?? [])]) tell(subscriber);
  };

  return {
    add(topic, subscriber, variables?, baseTopic?) {
      let own = resolve(topic);
      const created = !own;
      if (!own) {
        own = createSubscription(topic, variables, baseTopic);
        byTopic.set(topic, own);
      }
      own.subscribers.add(subscriber);
      const first = own;
      return {
        created,
        leave() {
          const s = liveSubscription(first);
          /* A subscription that already ended, or was renewed by someone
             else since, is not this subscriber's to let go. */
          if (!s.subscribers.delete(subscriber) || s.subscribers.size > 0) return undefined;
          if (byTopic.get(s.topic) !== s) return undefined;
          forget(s);
          return s.topic;
        },
      };
    },
    subscriptionOf: resolve,
    expect(topic) {
      const id = `sub-${++lastId}`;
      const s = resolve(topic);
      if (s) wait(s, id);
      return id;
    },
    rename(topic, serverTopic) {
      const s = resolve(topic);
      if (!s || s.topic === serverTopic) return;
      byTopic.delete(s.topic);
      const existing = byTopic.get(serverTopic);
      if (existing) {
        merge(s, existing);
        return;
      }
      s.labels.add(s.topic);
      byLabel.set(s.topic, s);
      s.topic = serverTopic;
      byTopic.set(serverTopic, s);
    },
    confirm(topic, id) {
      const s = (id === undefined ? undefined : byId.get(id)) ?? resolve(topic);
      if (!s) return undefined;
      /* The answer to a subscribe another one has since replaced. */
      if (id !== undefined && s.awaiting !== id) return "stale";
      wait(s, undefined);
      s.confirmed = true;
      return s;
    },
    unconfirmAll(error) {
      for (const s of byTopic.values()) {
        wait(s, undefined);
        for (const subscriber of [...s.subscribers]) subscriber.wait?.(error);
      }
    },
    dispatch: (topic, payload) => each(topic, (subscriber) => subscriber.data(payload)),
    fail: (topic, error) => each(topic, (subscriber) => subscriber.error?.(error)),
    end,
    endAll(error) {
      for (const topic of [...byTopic.keys()]) end(topic, error);
    },
    topics: () => [...byTopic.keys()],
    entries: () =>
      [...byTopic.values()].map((s) => ({
        qualifiedTopic: s.topic,
        baseTopic: s.baseTopic,
        variables: s.variables,
      })),
  };
}
