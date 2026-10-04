import type { RealtimeError } from "../errors";
import type { MessageQueueConfig } from "./message-queue";
import type { TopicRegistry } from "./topic-registry-types";
import {
  createSubscription,
  liveSubscription,
  mergeSubscription,
  type Subscription,
} from "./topic-subscription";

export type {
  Confirmation,
  HoldOutcome,
  TopicEntry,
  TopicMembership,
  TopicRegistry,
} from "./topic-registry-types";

/** Options for a topic registry. */
export interface TopicRegistryOptions {
  /** Limits on what is held for each unconfirmed subscription */
  messageQueue?: MessageQueueConfig | undefined;
  /** Told of messages that were held and will never go out */
  onDrop?: (topic: string, count: number) => void;
}

/**
 * Create a topic subscription registry for WS message routing: subscribers
 * per topic for fan-out, the name the server knows each subscription by, and
 * what is held for it until the server confirms it.
 *
 * @param options - Limits on held messages, and who hears of dropped ones
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

  function dropped(topic: string, count: number): void {
    if (count > 0) options.onDrop?.(topic, count);
  }

  function forget(s: Subscription): void {
    byTopic.delete(s.topic);
    for (const label of s.labels) byLabel.delete(label);
    if (s.awaiting !== undefined) byId.delete(s.awaiting);
    dropped(s.topic, s.held.take().length);
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
    dropped(into.topic, mergeSubscription(from, into));
    wait(into, from.awaiting);
  }

  return {
    add(topic, subscriber, variables?, baseTopic?) {
      let own = resolve(topic);
      const created = !own;
      if (!own) {
        own = createSubscription(topic, variables, baseTopic, options.messageQueue);
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
    has: (topic) => resolve(topic) !== undefined,
    serverTopic: (topic) => resolve(topic)?.topic,
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
      if (id !== undefined && s.awaiting !== id) return { topic: s.topic, held: [] };
      wait(s, undefined);
      s.confirmed = true;
      return { topic: s.topic, held: s.held.take() };
    },
    unconfirmAll() {
      for (const s of byTopic.values()) wait(s, undefined);
    },
    hold(topic, message) {
      const s = resolve(topic);
      if (!s || s.confirmed) return "open";
      return s.held.hold(message) ? "held" : "dropped";
    },
    dispatch(topic, payload) {
      for (const subscriber of resolve(topic)?.subscribers ?? []) subscriber.data(payload);
    },
    fail(topic, error) {
      for (const subscriber of resolve(topic)?.subscribers ?? []) subscriber.error?.(error);
    },
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
