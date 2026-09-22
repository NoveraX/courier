import type { PresenceAdapter, PresenceDiff } from "@noverax/courier/realtime";
import { trackHealth } from "./health";
import { createDiffBroadcast } from "./redis-presence-broadcast";
import {
  createDiffEmitter,
  createErrorEmitter,
  type DiffHandler,
  type PresenceContext,
} from "./redis-presence-emitters";
import { metaKey, scoreKey } from "./redis-presence-keys";
import { listEntries, sweepEntries } from "./redis-presence-queries";
import { heartbeatEntry, trackEntry, untrackEntry, updateEntry } from "./redis-presence-tracking";
import type { RedisPresenceConfig } from "./types";

const DEFAULT_PREFIX = "presence:";

/**
 * Redis presence adapter using ZSET (scores = lastSeenAt) + HASH (metadata).
 *
 * - ZSET `{prefix}score:{topic}` — member: connectionId, score: lastSeenAt ms
 * - HASH `{prefix}meta:{topic}` — field: connectionId, value: JSON metadata+userId+joinedAt
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { createRedisPresence } from "@noverax/courier-redis";
 *
 * const presence = createRedisPresence({ redis: new Redis() });
 * await presence.connect();
 *
 * await presence.track("room:1", {
 *   userId: "alice",
 *   connectionId: "conn_1",
 *   metadata: { status: "online" },
 * });
 * ```
 */
export function createRedisPresence(config: RedisPresenceConfig): PresenceAdapter {
  const { redis, subscriber, prefix = DEFAULT_PREFIX } = config;
  const errorHandlers = new Set<(error: Error) => void>();
  const diffHandlers = new Map<string, Set<DiffHandler>>();
  const health = trackHealth(redis);
  const origin = config.origin ?? crypto.randomUUID();
  let connected = false;

  const emitError = createErrorEmitter(errorHandlers);
  const deliverLocally = createDiffEmitter(diffHandlers, emitError);

  const broadcast = createDiffBroadcast({
    redis,
    subscriber,
    prefix,
    origin,
    deliver: deliverLocally,
    onError: emitError,
  });

  /* Local handlers run first — this replica already knows what it did — and
     the other replicas learn about it over the channel. */
  const emitDiff = (topic: string, diff: PresenceDiff): void => {
    deliverLocally(topic, diff);
    broadcast.publish(topic, diff);
  };

  const ctx: PresenceContext = {
    redis,
    prefix,
    errorHandlers,
    diffHandlers,
    emitError,
    emitDiff,
    sk: (topic) => scoreKey(prefix, topic),
    mk: (topic) => metaKey(prefix, topic),
    isConnected: () => connected,
  };

  return {
    /* A `connect` that only set a flag reported success against a Redis that
       was not there, and the caller learned otherwise at the first command. */
    async connect() {
      await redis.ping();
      if (subscriber) await subscriber.ping();
      connected = true;
    },

    async disconnect() {
      connected = false;
      await broadcast.close();
      errorHandlers.clear();
      diffHandlers.clear();
      health.cleanup();
    },

    isHealthy: () => connected && health.isHealthy(),

    onError(handler) {
      errorHandlers.add(handler);
      const onRedisError = (err: Error): void => handler(err);
      redis.on("error", onRedisError);
      return () => {
        errorHandlers.delete(handler);
        redis.off("error", onRedisError);
      };
    },

    track: (topic, entry) => trackEntry(ctx, topic, entry),
    update: (topic, connectionId, metadata) => updateEntry(ctx, topic, connectionId, metadata),
    untrack: (topic, connectionId) => untrackEntry(ctx, topic, connectionId),
    list: (topic) => listEntries(ctx, topic),
    heartbeat: (topic, connectionId) => heartbeatEntry(ctx, topic, connectionId),
    sweep: (topic, staleThresholdMs) => sweepEntries(ctx, topic, staleThresholdMs),

    onDiff(topic, handler) {
      let set = diffHandlers.get(topic);
      if (!set) {
        set = new Set();
        diffHandlers.set(topic, set);
      }
      set.add(handler);
      const captured = set;

      /* Subscribing is what makes this replica hear the others; without a
         subscriber client it only ever hears itself. */
      broadcast.listen(topic).catch(emitError);

      return () => {
        captured.delete(handler);
        if (captured.size === 0) {
          diffHandlers.delete(topic);
          broadcast.stopListening(topic).catch(emitError);
        }
      };
    },
  };
}
