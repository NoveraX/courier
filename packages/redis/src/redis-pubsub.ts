import { createLogger } from "@noverax/courier";
import type { PubSubAdapter, PubSubEnvelope } from "@noverax/courier/realtime";
import { trackHealth } from "./health";
import type { RedisPubSubConfig } from "./types";
import { isPubSubEnvelope } from "./wire-guards";

const log = createLogger("RedisPubSub");

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
  /* A set per topic, as the in-memory adapter keeps: a second subscriber
     used to replace the first, and either one leaving unsubscribed both. */
  const topicHandlers = new Map<string, Set<(message: unknown) => void>>();
  const pending = new Map<string, Promise<unknown>>();
  let connected = false;
  let listening = false;

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
      const envelope: unknown = JSON.parse(raw);
      if (!isPubSubEnvelope(envelope))
        throw new Error(`Not a Courier message on channel "${channel}"`);

      // Echo prevention — skip messages from self
      if (envelope.origin === origin) return;

      // Strip prefix to recover original topic
      const topic = prefix ? channel.slice(prefix.length) : channel;
      for (const handler of topicHandlers.get(topic) ?? []) handler(envelope.payload);
    } catch (err) {
      emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /* Named rather than inline so disconnect can remove them; an anonymous
     closure would accumulate one listener per connect/disconnect cycle. */
  const handleError = (err: Error): void => emitError(err);

  return {
    /* Both connections are verified, because a publisher that works and a
       subscriber that does not looks like silence rather than a failure. */
    async connect() {
      await publisher.ping();
      await subscriber.ping();
      /* Once: a second connect() used to attach the listeners again, and
         every message then reached every subscriber twice. */
      if (!listening) {
        publisher.on("error", handleError);
        subscriber.on("error", handleError);
        subscriber.on("message", handleMessage);
        listening = true;
      }
      connected = true;
    },

    async disconnect() {
      publisher.off("error", handleError);
      subscriber.off("error", handleError);
      subscriber.off("message", handleMessage);
      listening = false;

      // Unsubscribe from all active Redis channels
      const channels = [...topicHandlers.keys()].map(key);
      if (channels.length > 0) {
        await subscriber.unsubscribe(...channels).catch((err: unknown) => {
          // Best-effort during shutdown, but not unseen
          log.warn("Unsubscribing during disconnect failed", err);
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
      let handlers = topicHandlers.get(topic);
      if (!handlers) {
        handlers = new Set();
        topicHandlers.set(topic, handlers);
        pending.set(topic, subscriber.subscribe(key(topic)));
      }
      handlers.add(handler);

      try {
        // A later subscriber waits for the channel the first one opened.
        await pending.get(topic);
      } catch (err) {
        if (topicHandlers.get(topic) === handlers) topicHandlers.delete(topic);
        pending.delete(topic);
        throw err;
      }

      return () => {
        if (!handlers.delete(handler) || handlers.size > 0) return;
        if (topicHandlers.get(topic) !== handlers) return;
        topicHandlers.delete(topic);
        pending.delete(topic);
        subscriber.unsubscribe(key(topic)).catch((err: unknown) => {
          emitError(err instanceof Error ? err : new Error(String(err)));
        });
      };
    },
  };
}
