import type { StoredEvent, StreamAdapter } from "@noverax/courier/realtime";
import { createErrorForwarder } from "./error-forwarder";
import { trackHealth } from "./health";
import type { RedisStreamConfig } from "./types";

const DEFAULT_MAX_LEN = 1000;
const DEFAULT_HISTORY_LIMIT = 100;

/**
 * Redis Streams adapter for SSE event persistence and Last-Event-ID resume.
 * Uses XADD / XRANGE / XTRIM for durable ordered event storage.
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { createRedisStream } from "@noverax/courier-redis";
 *
 * const stream = createRedisStream({
 *   redis: new Redis(),
 *   prefix: "courier:stream:",
 *   maxLen: 1000,
 * });
 *
 * await stream.connect();
 * const id = await stream.append("events.chat", {
 *   data: { text: "hello" },
 *   timestamp: Date.now(),
 * });
 * ```
 */
export function createRedisStream(config: RedisStreamConfig): StreamAdapter {
  const { redis, prefix = "", maxLen = DEFAULT_MAX_LEN } = config;
  const errorHandlers = new Set<(error: Error) => void>();
  const errors = createErrorForwarder(redis, errorHandlers);
  const health = trackHealth(redis);
  let connected = false;

  function emitError(error: Error): void {
    for (const handler of errorHandlers) {
      handler(error);
    }
  }

  function key(topic: string): string {
    return prefix + topic;
  }

  /** Parse a Redis XRANGE entry `[id, [field, value, ...]]` into StoredEvent */
  function parseEntry(entry: [string, string[]]): StoredEvent {
    const [id, fields] = entry;
    const map = new Map<string, string>();
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const name = fields[i];
      const value = fields[i + 1];
      if (name !== undefined && value !== undefined) map.set(name, value);
    }

    let data: unknown = null;
    try {
      data = JSON.parse(map.get("data") ?? "null");
    } catch {
      // Corrupted stream entry — return null data instead of crashing
      emitError(new Error(`Stream entry ${id}: invalid JSON data`));
    }

    return {
      id,
      event: map.get("event") ?? undefined,
      data,
      timestamp: Number(map.get("timestamp") ?? "0"),
    };
  }

  return {
    /* Verifying beats reporting success against a Redis that is not there. */
    async connect() {
      await redis.ping();
      errors.start();
      connected = true;
    },

    async disconnect() {
      connected = false;
      errors.stop();
      errorHandlers.clear();
      health.cleanup();
    },

    isHealthy() {
      return connected && health.isHealthy();
    },

    onError(handler) {
      errorHandlers.add(handler);
      errors.start();
      return () => {
        errorHandlers.delete(handler);
      };
    },

    async append(topic, event) {
      const fields: string[] = [
        "data",
        JSON.stringify(event.data),
        "timestamp",
        String(event.timestamp),
      ];

      if (event.event) {
        fields.push("event", event.event);
      }

      try {
        const args: (string | number)[] = [key(topic)];

        // Auto-trim with approximate MAXLEN for performance
        if (maxLen > 0) {
          args.push("MAXLEN", "~", maxLen);
        }

        args.push("*", ...fields);
        const id = await redis.xadd(...(args as [string, ...string[]]));
        return id as string;
      } catch (err) {
        emitError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },

    async getHistory(topic, afterId, limit = DEFAULT_HISTORY_LIMIT) {
      try {
        // XRANGE exclusive start: afterId is the last seen ID
        // Redis XRANGE is inclusive, so we use "(" prefix for exclusive (Redis 6.2+)
        const exclusiveStart = `(${afterId}`;
        const entries = await redis.xrange(key(topic), exclusiveStart, "+", "COUNT", limit);

        return (entries as [string, string[]][]).map(parseEntry);
      } catch (err) {
        emitError(err instanceof Error ? err : new Error(String(err)));
        return [];
      }
    },

    async trim(topic, trimMaxLen) {
      try {
        await redis.xtrim(key(topic), "MAXLEN", trimMaxLen);
      } catch (err) {
        emitError(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}
