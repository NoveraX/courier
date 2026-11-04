import type { RealtimeError } from "../errors";
import type { Subscription } from "./topic-subscription";
import type { TopicSubscriber } from "./ws-types";

/** Entry returned by `entries()` for re-subscribing after a reconnect */
export interface TopicEntry {
  /** The topic the server knows the subscription by */
  qualifiedTopic: string;
  baseTopic: string;
  variables?: unknown;
}

/** A subscriber's place on a topic. */
export interface TopicMembership {
  /** Whether this subscriber opened the subscription — the moment to tell the server. */
  created: boolean;
  /**
   * Leave the topic. Returns the topic to unsubscribe from when this was the
   * subscription's last subscriber, and nothing otherwise.
   */
  leave(): string | undefined;
}

/**
 * What the server's confirmation of a subscribe answers to: the
 * subscription it confirmed, or `"stale"` for the answer to a subscribe a
 * newer one has replaced.
 */
export type Confirmation = Subscription | "stale";

/**
 * Internal topic subscription registry with message routing.
 *
 * A subscription is known by the topic the client asked for until the server
 * names another — it qualifies the topic from the variables its schema
 * produced, defaults included — and by both from then on. Everything that
 * takes a topic accepts either name.
 */
export interface TopicRegistry {
  /** Add a subscriber for a topic. */
  add(
    topic: string,
    subscriber: TopicSubscriber,
    variables?: unknown,
    baseTopic?: string,
  ): TopicMembership;
  /** The subscription a topic names, either of its names. */
  subscriptionOf(topic: string): Subscription | undefined;
  /**
   * Record that a subscribe is on its way for the topic. Returns the id the
   * subscribe carries.
   */
  expect(topic: string): string;
  /** The server subscribed `topic` under `serverTopic`. */
  rename(topic: string, serverTopic: string): void;
  /**
   * The server confirmed the subscribe with `id` on `topic`. Returns nothing
   * when no subscription answers to it — the client left before it was confirmed.
   */
  confirm(topic: string, id: string | undefined): Confirmation | undefined;
  /** Every subscription waits for the server again: the socket closed. Each subscriber hears `error`, when there is one. */
  unconfirmAll(error?: RealtimeError): void;
  /** Route an incoming message payload to all subscribers of a topic. */
  dispatch(topic: string, payload: unknown): void;
  /** Tell a topic's subscribers of an error on it; the subscription goes on. */
  fail(topic: string, error: RealtimeError): void;
  /** End a topic for its subscribers and forget it, so a reconnect does not renew it. */
  end(topic: string, error: RealtimeError | undefined): void;
  /** End every topic, as `end` does. */
  endAll(error: RealtimeError | undefined): void;
  /** Get all currently subscribed topics, as the server knows them. */
  topics(): string[];
  /** Get all entries with variables metadata for reconnection. */
  entries(): TopicEntry[];
}
