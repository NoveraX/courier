/**
 * Callers' counts kept in Redis, against a real Redis — set REDIS_URL, or
 * run one on the default port; skipped when none answers. Replicas sharing
 * the Redis share each caller's budget; every call is taken atomically on
 * Redis's clock; a caller whose budget is whole leaves no key; and a Redis
 * that forgot the script is sent it again. Nothing here changes anything of
 * the Redis but keys under a prefix of its own, which expire.
 */
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";

import { createRedisRateLimitStore } from "../src/redis-rate-limit";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function redisAnswers(): Promise<boolean> {
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

const available = await redisAnswers();
const clients: Redis[] = [];
const prefix = `courier-test:${randomUUID()}:`;

function client(): Redis {
  const redis = new Redis(REDIS_URL);
  clients.push(redis);
  return redis;
}

afterAll(async () => {
  await Promise.all(clients.map((redis) => redis.quit()));
});

const TWO_A_MINUTE = { requests: 2, window: 60_000 };

describe.skipIf(!available)("createRedisRateLimitStore", () => {
  it("holds a caller to one budget across replicas", async () => {
    const replicas = [
      createRedisRateLimitStore({ redis: client(), prefix }),
      createRedisRateLimitStore({ redis: client(), prefix }),
    ];

    const decisions = [
      await replicas[0]?.take("calls:a", TWO_A_MINUTE),
      await replicas[1]?.take("calls:a", TWO_A_MINUTE),
      await replicas[0]?.take("calls:a", TWO_A_MINUTE),
    ];

    expect(decisions.map((decision) => decision?.allowed)).toEqual([true, true, false]);
    expect(decisions[1]?.remaining).toBe(0);
    expect(decisions[2]?.retryAfterMs).toBeGreaterThan(29_000);
    expect(decisions[2]?.retryAfterMs).toBeLessThanOrEqual(30_000);
  });

  it("takes every call of a burst once, however many arrive together", async () => {
    const store = createRedisRateLimitStore({ redis: client(), prefix });

    const decisions = await Promise.all(
      Array.from({ length: 50 }, () => store.take("calls:burst", { requests: 10, window: 60_000 })),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
  });

  it("keeps a caller's key no longer than its budget takes to be whole", async () => {
    const redis = client();
    const store = createRedisRateLimitStore({ redis, prefix });

    await store.take("calls:ttl", { requests: 3, window: 3000 });

    const ttl = await redis.pttl(`${prefix}calls:ttl`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1000);
  });

  it("sends the script again to a Redis that forgot it", async () => {
    const forgot = new Proxy(client(), {
      get(target, property, receiver) {
        if (property !== "evalsha") return Reflect.get(target, property, receiver);
        return () => Promise.reject(new Error("NOSCRIPT No matching script. Please use EVAL."));
      },
    });
    const store = createRedisRateLimitStore({ redis: forgot, prefix });

    await store.take("calls:forgotten", TWO_A_MINUTE);

    expect(await store.take("calls:forgotten", TWO_A_MINUTE)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });
});
