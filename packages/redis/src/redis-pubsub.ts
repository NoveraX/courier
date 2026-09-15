import type { PubSubAdapter, PubSubEnvelope } from "@noverax/courier/realtime";
import { trackHealth } from "./health";
import type { RedisPubSubConfig } from "./types";

/**
 * Redis Pub/Sub adapter for horizontal WS scaling.
 * Uses two separate ioredis connections (publisher + subscriber).
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { createRedisPubSub } from "@noverax/courier-redis";
 *
 * const pubsub = createRedisPubSub({
 *   publisher: new Redis(),
 *   subscriber: new Redis(),
 * });
 *
 * await pubsub.connect();
 * ```
 */
export function createRedisPubSub(config: RedisPubSubConfig): PubSubAdapter {
  const { publisher, subscriber, prefix = "" } = config;
  const origin = config.origin ?? crypto.randomUUID();
  const errorHandlers = new Set<(error: Error) => void>();
  const topicHandlers = new Map<string, (message: unknown) => void>();
  let connected = false;

  const pubHealth = trackHealth(publisher);
  const subHealth = trackHealth(subscriber);

  function emitError(error: Error): void {
    for (const handler of errorHandlers) {
      handler(error);
    }
  }

  function key(topic: string): string {
    return prefix + topic;
  }

  function handleMessage(channel: string, raw: string): void {
    try {
      const envelope = JSON.parse(raw) as PubSubEnvelope;

      // Echo prevention — skip messages from self
      if (envelope.origin === origin) return;

      // Strip prefix to recover original topic
      const topic = prefix ? channel.slice(prefix.length) : channel;
      const handler = topicHandlers.get(topic);
      handler?.(envelope.payload);
    } catch (err) {
      emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  return {
    async connect() {
      // Shared error listeners — register once, dispatch to all handlers via emitError
      publisher.on("error", (err: Error) => emitError(err));
      subscriber.on("error", (err: Error) => emitError(err));
      subscriber.on("message", handleMessage);
      connected = true;
    },

    async disconnect() {
      subscriber.off("message", handleMessage);

      // Unsubscribe from all active Redis channels
      const channels = [...topicHandlers.keys()].map(key);
      if (channels.length > 0) {
        await subscriber.unsubscribe(...channels).catch(() => {
          // Best-effort cleanup during shutdown
        });
      }

      topicHandlers.clear();
      errorHandlers.clear();
      pubHealth.cleanup();
      subHealth.cleanup();
      connected = false;
    },

    isHealthy() {
      return connected && pubHealth.isHealthy() && subHealth.isHealthy();
    },

    onError(handler) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },

    async publish(topic, message) {
      if (!connected) return;

      const envelope: PubSubEnvelope = {
        origin,
        payload: message,
        timestamp: Date.now(),
      };

      try {
        await publisher.publish(key(topic), JSON.stringify(envelope));
      } catch (err) {
        emitError(err instanceof Error ? err : new Error(String(err)));
      }
    },

    async subscribe(topic, handler) {
      topicHandlers.set(topic, handler);

      try {
        await subscriber.subscribe(key(topic));
      } catch (err) {
        topicHandlers.delete(topic);
        throw err;
      }

      return () => {
        topicHandlers.delete(topic);
        subscriber.unsubscribe(key(topic)).catch((err: unknown) => {
          emitError(err instanceof Error ? err : new Error(String(err)));
        });
      };
    },
  };
}
