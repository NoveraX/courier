import { createHash } from "node:crypto";
import type { Redis } from "ioredis";

/** A Lua script, with the SHA-1 Redis caches it under. */
export interface RedisScript {
  readonly source: string;
  readonly sha: string;
}

/**
 * A Lua script, named by the SHA-1 Redis caches it under.
 *
 * @param source - The script
 * @returns The script and its SHA-1
 * @example
 * ```ts
 * const RENEW = defineScript(`return redis.call("PEXPIRE", KEYS[1], ARGV[1])`);
 * ```
 */
export function defineScript(source: string): RedisScript {
  return { source, sha: createHash("sha1").update(source).digest("hex") };
}

/**
 * Run a script by its SHA-1, and by its source when Redis has not cached
 * it — after a restart, or on a server that never ran it. Two runs sent
 * one after the other may then run in the other order: a script whose
 * runs must keep their order is sent with `EVAL` each time instead.
 *
 * @param redis - The client it is run on
 * @param script - The script
 * @param keys - The keys it touches, all of one hash slot for Redis Cluster
 * @param args - Its arguments
 * @returns What the script returned
 * @example
 * ```ts
 * await runScript(redis, RENEW, [key], [String(ttlMs)]);
 * ```
 */
export function runScript(
  redis: Redis,
  script: RedisScript,
  keys: readonly string[],
  args: readonly string[],
): Promise<unknown> {
  return redis.evalsha(script.sha, keys.length, ...keys, ...args).catch((error: unknown) => {
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT")) throw error;
    return redis.eval(script.source, keys.length, ...keys, ...args);
  });
}
