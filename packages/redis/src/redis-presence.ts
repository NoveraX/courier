import type { PresenceAdapter, PresenceDiff } from "@noverax/courier/realtime";
import { CONNECT_TIMEOUT_MS, DISCONNECT_TIMEOUT_MS, withinDeadline } from "./adapter-deadlines";
import { createErrorForwarder } from "./error-forwarder";
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
 * It works from the moment it is made: what it is asked before Redis
 * answers waits for Redis, as the client's commands do, and the other
 * replicas' diffs are heard as soon as the subscriber is ready, and again
 * after every reconnect and every refusal. `connect({ timeoutMs })`
 * resolves once Redis answers both clients, and rejects with a client's own
 * error, or at its deadline while the adapter goes on connecting;
 * `disconnect({ timeoutMs })` settles within its deadline whatever Redis
 * does, and what is asked after it is ignored.
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
  const errors = createErrorForwarder(redis, errorHandlers);
  const diffHandlers = new Map<string, Set<DiffHandler>>();
  const health = trackHealth(redis);
  const origin = config.origin ?? crypto.randomUUID();
  const clients = subscriber ? [redis, subscriber] : [redis];
  const emitError = createErrorEmitter(errorHandlers);
  const deliverLocally = createDiffEmitter(diffHandlers, emitError);
  /* Each topic heard from the other replicas, and how to stop hearing it. */
  const heard = new Map<string, () => void>();
  let stopped = false;

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
    isStopped: () => stopped,
  };

  errors.start();
  /* A client made with lazyConnect waits for a command; this one is sent as soon as it is asked. */
  for (const client of clients) {
    if (client.status === "wait") client.connect().catch(() => undefined);
  }

  return {
    async connect(options) {
      if (stopped) throw new Error("The Redis presence adapter was stopped with disconnect()");
      /* Answered by Redis itself, not a flag: a PING goes once the client
         has connected, and a client that cannot says why. */
      const answers = Promise.all(clients.map((client) => client.ping()));
      await withinDeadline(answers, options?.timeoutMs ?? CONNECT_TIMEOUT_MS);
    },

    async disconnect(options) {
      if (stopped) return;
      stopped = true;
      heard.clear();
      await broadcast.close(options?.timeoutMs ?? DISCONNECT_TIMEOUT_MS);
      errors.stop();
      errorHandlers.clear();
      diffHandlers.clear();
      health.cleanup();
    },

    isHealthy: () => !stopped && health.isHealthy(),

    onError(handler) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
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

      /* Hearing a topic is what makes this replica hear the others' diffs
         on it; without a subscriber client it only ever hears itself. */
      if (!stopped && !heard.has(topic)) heard.set(topic, broadcast.listen(topic));

      return () => {
        captured.delete(handler);
        if (captured.size > 0) return;
        diffHandlers.delete(topic);
        heard.get(topic)?.();
        heard.delete(topic);
      };
    },
  };
}
