import type { Redis } from "ioredis";

/** Configuration for {@link createRedisPresence} */
export interface RedisPresenceConfig {
  /** Redis instance for ZADD / HSET / ZRANGEBYSCORE commands */
  redis: Redis;
  /**
   * Key prefix for presence data (e.g. `"nexus:presence:"`).
   * Two keys per topic: `{prefix}score:{topic}` (ZSET) and `{prefix}meta:{topic}` (HASH).
   * @default "presence:"
   */
  prefix?: string;
}

/** Configuration for {@link createRedisPubSub} */
export interface RedisPubSubConfig {
  /**
   * Redis instance used for PUBLISH commands.
   * Must be a separate connection from `subscriber`.
   */
  publisher: Redis;
  /**
   * Redis instance used for SUBSCRIBE commands.
   * ioredis enters subscriber mode — this connection cannot run other commands.
   */
  subscriber: Redis;
  /**
   * Custom origin ID for echo prevention.
   * Defaults to `crypto.randomUUID()`.
   */
  origin?: string;
  /**
   * Channel key prefix (e.g. `"nexus:"`).
   * Applied to all topic names: `prefix + topic`.
   * @default ""
   */
  prefix?: string;
}

/** Configuration for {@link createRedisStream} */
export interface RedisStreamConfig {
  /** Redis instance for XADD / XRANGE / XTRIM commands */
  redis: Redis;
  /**
   * Stream key prefix (e.g. `"nexus:stream:"`).
   * Applied to all topic names: `prefix + topic`.
   * @default ""
   */
  prefix?: string;
  /**
   * Default MAXLEN for auto-trim on append.
   * Set to `0` to disable auto-trim.
   * @default 1000
   */
  maxLen?: number;
}
