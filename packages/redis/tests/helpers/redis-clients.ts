import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";

import type { RedisRelay } from "./redis-relay";

/** The test's Redis: REDIS_URL, or one on the default port. */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Whether a Redis answers at {@link REDIS_URL}; the suites that need one
 * are skipped when none does.
 *
 * @returns Whether it answered PING
 */
export async function redisAnswers(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  probe.on("error", () => undefined);
  try {
    await probe.connect();
    return (await probe.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

/** The client settings a test varies. */
export interface ClientOptions {
  /** How many reconnects a command waits through; `null` for as many as it takes */
  maxRetriesPerRequest?: number | null;
  /** The ACL user it signs in as, with its password */
  username?: string;
  password?: string;
}

/** The clients a test made, ended after it. */
export interface RedisClients {
  /** A client of the test's Redis — through a relay, when one is given, reconnecting every 50 ms */
  client(through?: RedisRelay, options?: ClientOptions): Redis;
  /** End every client made, and delete the keys under `prefix` */
  end(): Promise<void>;
  /** Keys and channels of one test run, so runs and replicas never meet */
  readonly prefix: string;
}

/**
 * Clients of the test's Redis for one suite, every one ended — and every
 * key under the suite's prefix deleted — when `end` is called.
 *
 * @returns The suite's clients
 * @example
 * ```ts
 * const redis = redisClients();
 * afterEach(() => redis.end());
 * const publisher = redis.client();
 * ```
 */
export function redisClients(): RedisClients {
  const made: Redis[] = [];
  const prefix = `courier-test:${randomUUID()}:`;
  return {
    prefix,
    client(through, options = {}) {
      const redis = through
        ? new Redis({ host: "127.0.0.1", port: through.port, retryStrategy: () => 50, ...options })
        : new Redis(REDIS_URL, options);
      redis.on("error", () => undefined);
      made.push(redis);
      return redis;
    },
    async end() {
      const cleaner = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
      cleaner.on("error", () => undefined);
      try {
        const keys = await cleaner.keys(`${prefix}*`);
        if (keys.length > 0) await cleaner.del(...keys);
      } finally {
        cleaner.disconnect();
      }
      for (const redis of made.splice(0)) redis.disconnect();
    },
  };
}
