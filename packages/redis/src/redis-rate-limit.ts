import { createHash } from "node:crypto";
import type { RateLimitDecision, RateLimitStore, RateLimitWindow } from "@noverax/courier";
import type { RedisRateLimitConfig } from "./types";

/*
 * One call taken from a caller's budget, atomically, by the Generic Cell
 * Rate Algorithm: the key holds the time the caller's calls are spent up
 * to, read on Redis's own clock so every replica counts alike, and expires
 * once the budget is whole again. Numbers go back as strings: Redis would
 * cut a fraction of a millisecond off an integer reply.
 */
const TAKE = `
if redis.replicate_commands then redis.replicate_commands() end
local interval = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + tonumber(clock[2]) / 1000
local from = tonumber(redis.call("GET", KEYS[1]) or now)
if from < now then from = now end
local nextAt = from + interval
local allowedAt = nextAt - window
if now < allowedAt then
  return {0, tostring(from - now), tostring(allowedAt - now)}
end
redis.call("SET", KEYS[1], tostring(nextAt), "PX", math.max(1, math.ceil(nextAt - now)))
return {1, tostring(nextAt - now), "0"}
`;
const TAKE_SHA = createHash("sha1").update(TAKE).digest("hex");

/**
 * Callers' counts kept in Redis, so one caller has one budget however many
 * replicas serve it: each call is taken in one script, on Redis's clock,
 * and a caller whose budget is whole again leaves no key behind.
 *
 * @param config - The Redis client, and the prefix its keys go under
 * @returns The store, for the proxy's `rateLimit`
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { createRedisRateLimitStore } from "@noverax/courier-redis";
 *
 * createHandler({
 *   rateLimit: { requests: 300, window: 60_000, store: createRedisRateLimitStore({ redis: new Redis() }) },
 * });
 * ```
 */
export function createRedisRateLimitStore({
  redis,
  prefix = "courier:ratelimit:",
}: RedisRateLimitConfig): RateLimitStore {
  return {
    async take(key, limit) {
      const interval = limit.window / limit.requests;
      const args = [`${prefix}${key}`, String(interval), String(limit.window)] as const;
      const reply = await redis.evalsha(TAKE_SHA, 1, ...args).catch((error: unknown) => {
        if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT")) throw error;
        return redis.eval(TAKE, 1, ...args);
      });
      return decisionOf(reply, limit, interval);
    },
  };
}

function decisionOf(reply: unknown, limit: RateLimitWindow, interval: number): RateLimitDecision {
  const [allowed, reset, retryAfter] = Array.isArray(reply) ? reply : [];
  const resetMs = Number(reset);
  if (Number(allowed) !== 1) {
    return { allowed: false, remaining: 0, resetMs, retryAfterMs: Number(retryAfter) };
  }
  const remaining = Math.floor((limit.window - resetMs) / interval + 1e-9);
  return { allowed: true, remaining, resetMs, retryAfterMs: 0 };
}
