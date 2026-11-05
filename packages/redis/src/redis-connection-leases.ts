import { createHash } from "node:crypto";
import type { ConnectionLeaseStore, LeaseGrant } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";
import type { RedisConnectionLeasesConfig } from "./types";

/*
 * A lease taken under a scope's limit, atomically: the lapsed leases are
 * dropped, one held is renewed, a new one is added — giving up the oldest
 * over the limit, or refused — on Redis's own clock, so every replica
 * counts alike. Each lease's value is "<joined>:<expires>"; the oldest by
 * when it joined goes first, an id deciding between two of one moment.
 */
const ACQUIRE = `
if redis.replicate_commands then redis.replicate_commands() end
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl, max = tonumber(ARGV[2]), tonumber(ARGV[3])
local live = {}
local fields = redis.call("HGETALL", KEYS[1])
for i = 1, #fields, 2 do
  local joined, expires = string.match(fields[i + 1], "^(%d+):(%d+)$")
  if expires and tonumber(expires) > now then
    if fields[i] == ARGV[1] then
      redis.call("HSET", KEYS[1], ARGV[1], joined .. ":" .. string.format("%d", now + ttl))
      redis.call("PEXPIRE", KEYS[1], ttl)
      return {1}
    end
    live[#live + 1] = {fields[i], tonumber(joined)}
  else
    redis.call("HDEL", KEYS[1], fields[i])
  end
end
local reply = {1}
if #live >= max then
  if ARGV[4] == "reject" then return {0} end
  table.sort(live, function(a, b) return a[2] < b[2] or (a[2] == b[2] and a[1] < b[1]) end)
  for i = 1, #live - max + 1 do
    redis.call("HDEL", KEYS[1], live[i][1])
    reply[#reply + 1] = live[i][1]
  end
end
redis.call("HSET", KEYS[1], ARGV[1], string.format("%d", now) .. ":" .. string.format("%d", now + ttl))
redis.call("PEXPIRE", KEYS[1], ttl)
return reply
`;

/* A lease renewed if it is still held: one given up for a newer one stays given up. */
const RENEW = `
if redis.replicate_commands then redis.replicate_commands() end
local value = redis.call("HGET", KEYS[1], ARGV[1])
if not value then return 0 end
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local joined = string.match(value, "^(%d+):")
redis.call("HSET", KEYS[1], ARGV[1], joined .. ":" .. string.format("%d", now + tonumber(ARGV[2])))
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return 1
`;

const SCRIPTS = { acquire: ACQUIRE, renew: RENEW };
const SHAS = {
  acquire: createHash("sha1").update(ACQUIRE).digest("hex"),
  renew: createHash("sha1").update(RENEW).digest("hex"),
};

/**
 * Connection leases kept in Redis, so a limit on one key's connections
 * counts them on every replica: each decision is one script on one key —
 * fit for Redis Cluster as it is — made on Redis's clock. A lease lapses
 * unless renewed within `ttlMs`, so a replica that stops without releasing
 * frees its leases in time.
 *
 * @param config - The Redis client, the prefix its keys go under, and how long a lease is kept
 * @returns The store, for a WebSocket handler's `connectionLeases`
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { createRedisConnectionLeases } from "@noverax/courier-redis";
 *
 * createWSHandler({
 *   onConnect: ({ auth }) => ({ userId: auth?.userId }),
 *   maxConnectionsPerKey: { key: (meta) => meta.userId as string | undefined, max: 5 },
 *   connectionLeases: createRedisConnectionLeases({ redis: new Redis() }),
 * });
 * ```
 */
export function createRedisConnectionLeases({
  redis,
  prefix = "courier:leases:",
  ttlMs = 60_000,
}: RedisConnectionLeasesConfig): ConnectionLeaseStore {
  return {
    async acquire(scope, lease, rule) {
      const args = [lease, String(ttlMs), String(rule.max), rule.onExceed];
      return grantOf(await run(redis, "acquire", `${prefix}${scope}`, args));
    },
    async renew(leases) {
      if (leases.length === 0) return;
      await Promise.all(
        leases.map(({ scope, lease }) =>
          run(redis, "renew", `${prefix}${scope}`, [lease, String(ttlMs)]),
        ),
      );
    },
    async release(scope, lease) {
      await redis.hdel(`${prefix}${scope}`, lease);
    },
  };
}

function run(redis: Redis, script: keyof typeof SCRIPTS, key: string, args: string[]) {
  return redis.evalsha(SHAS[script], 1, key, ...args).catch((error: unknown) => {
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT")) throw error;
    return redis.eval(SCRIPTS[script], 1, key, ...args);
  });
}

function grantOf(reply: unknown): LeaseGrant {
  const [admitted, ...evict] = Array.isArray(reply) ? reply : [];
  if (Number(admitted) !== 1) return { admitted: false };
  return { admitted: true, evict: evict.map(String) };
}
