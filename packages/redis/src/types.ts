import type { Redis } from "ioredis";

/** Configuration for {@link createRedisPresence} */
export interface RedisPresenceConfig {
  /**
   * Redis instance for ZADD / HSET / ZRANGEBYSCORE commands.
   *
   * Typed against ioredis's default `legacy` reply mapping, which is what
   * both v5 and v6 give you unless `replyMapping: "resp3"` is asked for. A
   * client configured that way still works — the presence reader accepts
   * either reply shape — but it is not what this type describes.
   */
  redis: Redis;
  /**
   * Key prefix for presence data (e.g. `"courier:presence:"`).
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
   * Kept dedicated to subscriptions: RESP2 forbids other commands on a
   * subscribed connection outright, and RESP3 allows them but still delivers
   * every message for this connection through the same handler.
   */
  subscriber: Redis;
  /**
   * Custom origin ID for echo prevention.
   * Defaults to `crypto.randomUUID()`.
   */
  origin?: string;
  /**
   * Channel key prefix (e.g. `"courier:"`).
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
   * Stream key prefix (e.g. `"courier:stream:"`).
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
