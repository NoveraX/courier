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
 * the adapter says so rather than pretending.
 */

import type { PresenceDiff } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";

interface DiffEnvelope {
  origin: string;
  topic: string;
  diff: PresenceDiff;
}

/** Channel a topic's diffs travel on. */
export function diffChannel(prefix: string, topic: string): string {
  return `${prefix}diff:${topic}`;
}

/** Everything the broadcast side needs, gathered once at construction. */
export interface DiffBroadcast {
  /** Send a diff to the other replicas. Does nothing without a subscriber. */
  publish(topic: string, diff: PresenceDiff): void;
  /** Start listening for other replicas' diffs on this topic. */
  listen(topic: string): Promise<void>;
  /** Stop listening for this topic. */
  stopListening(topic: string): Promise<void>;
  /** Release the subscription. */
  close(): Promise<void>;
  /** Whether diffs reach other replicas at all. */
  readonly crossReplica: boolean;
}

export function createDiffBroadcast(input: {
  redis: Redis;
  subscriber?: Redis;
  prefix: string;
  origin: string;
  deliver: (topic: string, diff: PresenceDiff) => void;
  onError: (error: Error) => void;
}): DiffBroadcast {
  const { redis, subscriber, prefix, origin, deliver, onError } = input;
  const listening = new Set<string>();

  subscriber?.on("message", (_channel: string, raw: string) => {
    try {
      const envelope = JSON.parse(raw) as DiffEnvelope;
      /* A replica already ran its own handlers before publishing. */
      if (envelope.origin === origin) return;
      deliver(envelope.topic, envelope.diff);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  return {
    crossReplica: subscriber !== undefined,

    publish(topic, diff) {
      if (!subscriber) return;
      const envelope: DiffEnvelope = { origin, topic, diff };
      redis.publish(diffChannel(prefix, topic), JSON.stringify(envelope)).catch((err: unknown) => {
        onError(err instanceof Error ? err : new Error(String(err)));
      });
    },

    async listen(topic) {
      if (!subscriber || listening.has(topic)) return;
      listening.add(topic);
      try {
        await subscriber.subscribe(diffChannel(prefix, topic));
      } catch (err) {
        listening.delete(topic);
        throw err;
      }
    },

    async stopListening(topic) {
      if (!subscriber || !listening.delete(topic)) return;
      await subscriber.unsubscribe(diffChannel(prefix, topic));
    },

    async close() {
      if (!subscriber) return;
      for (const topic of listening) await subscriber.unsubscribe(diffChannel(prefix, topic));
      listening.clear();
    },
  };
}
