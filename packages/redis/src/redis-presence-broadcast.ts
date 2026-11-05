/**
 * Carrying presence diffs between replicas.
 *
 * The ZSET and HASH make presence *state* shared: any replica can list a topic
 * and see what every other one wrote. Notifications were a different matter —
 * the diff emitter dispatched to handlers registered on that one instance, so
 * a replica learned only about the joins and leaves it had handled itself. On
 * the deployment this package exists for, a presence UI missed everything that
 * happened on the other replicas.
 *
 * Diffs now travel the same way pub/sub messages do: a JSON envelope stamped
 * with the sender's id, so a replica ignores the echo of its own publish.
 *
 * Redis puts a subscribed connection into a mode that accepts almost nothing
 * else, so receiving needs its own client. Without one, diffs stay local and
 * the adapter says so rather than pretending. A topic's channel is wanted
 * rather than subscribed once: made as soon as the subscriber is ready, again
 * after every reconnect and after a refusal, so a replica that started
 * before Redis, or lost it a while, hears the others again.
 */

import type { PresenceDiff } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";
import { createSubscriptionReconciler } from "./subscription-reconciler";
import { type DiffEnvelope, isDiffEnvelope } from "./wire-guards";

/** Channel a topic's diffs travel on. */
export function diffChannel(prefix: string, topic: string): string {
  return `${prefix}diff:${topic}`;
}

export interface DiffBroadcast {
  /** Send a diff to the other replicas. Does nothing without a subscriber. */
  publish(topic: string, diff: PresenceDiff): void;
  /** Hear the other replicas' diffs on a topic, until the returned function is called. */
  listen(topic: string): () => void;
  /** Hear nothing more, letting the channels go within `timeoutMs`. */
  close(timeoutMs: number): Promise<void>;
  /** Whether diffs reach other replicas at all. */
  readonly crossReplica: boolean;
  /** The topics' channels wanted, and those Redis has confirmed. */
  readonly channels: { readonly wanted: number; readonly confirmed: number };
}

export function createDiffBroadcast(input: {
  redis: Redis;
  subscriber?: Redis | undefined;
  prefix: string;
  origin: string;
  deliver: (topic: string, diff: PresenceDiff) => void;
  onError: (error: Error) => void;
}): DiffBroadcast {
  const { redis, subscriber, prefix, origin, deliver, onError } = input;
  const subscriptions = subscriber && createSubscriptionReconciler(subscriber, onError);

  /* A channel this adapter does not want is another's, on a subscriber two
     adapters share; a diff goes to the topic of the channel it came on,
     whatever topic its envelope names. */
  const onMessage = (channel: string, raw: string): void => {
    const handlers = subscriptions?.handlersOf(channel);
    if (!handlers) return;
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      envelope = undefined;
    }
    if (!isDiffEnvelope(envelope)) {
      onError(new Error(`Not a Courier presence change on channel "${channel}"`));
      return;
    }
    /* A replica already ran its own handlers before publishing. */
    if (envelope.origin === origin) return;
    for (const handler of [...handlers]) handler(envelope.diff);
  };
  const onReady = (): void => subscriptions?.connected();
  const onLost = (): void => subscriptions?.disconnected();
  const events = [
    ["message", onMessage],
    ["ready", onReady],
    ["close", onLost],
    ["end", onLost],
  ] as const;
  for (const [event, listener] of events) subscriber?.on(event, listener);
  if (subscriber?.status === "ready") subscriptions?.connected();

  return {
    crossReplica: subscriber !== undefined,

    publish(topic, diff) {
      if (!subscriber) return;
      const envelope: DiffEnvelope = { origin, topic, diff };
      redis.publish(diffChannel(prefix, topic), JSON.stringify(envelope)).catch((err: unknown) => {
        onError(err instanceof Error ? err : new Error(String(err)));
      });
    },

    listen(topic) {
      if (!subscriptions) return () => undefined;
      return subscriptions.add(diffChannel(prefix, topic), (diff) => {
        deliver(topic, diff as PresenceDiff);
      });
    },

    async close(timeoutMs) {
      for (const [event, listener] of events) subscriber?.off(event, listener);
      await subscriptions?.stop(timeoutMs);
    },

    get channels() {
      return { wanted: subscriptions?.wanted ?? 0, confirmed: subscriptions?.confirmed ?? 0 };
    },
  };
}
