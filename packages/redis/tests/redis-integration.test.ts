/**
 * The Redis adapters against a real Redis — set REDIS_URL, or run one on
 * 127.0.0.1:6379; the suite is skipped when none answers.
 *
 * The mocks in the other files cannot see what these did: a second
 * subscriber on a topic replaced the first; a second connect() doubled
 * every message; a heartbeat after a sweep brought a connection back
 * without its metadata; a sweep over 8000 stale connections failed on Lua's
 * `unpack` limit, forever; and error listeners outlived disconnect().
 */
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPresence } from "../src/redis-presence";
import { createRedisPubSub } from "../src/redis-pubsub";

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

afterEach(async () => {
  const cleaner = clients[0];
  if (cleaner) {
    const keys = await cleaner.keys(`${prefix}*`);
    if (keys.length > 0) await cleaner.del(...keys);
  }
  for (const redis of clients.splice(0)) redis.disconnect();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe.skipIf(!available)("createRedisPubSub", () => {
  it("delivers to every subscriber of a topic, and one leaving keeps the other", async () => {
    const sub = createRedisPubSub({ publisher: client(), subscriber: client(), prefix });
    const pub = createRedisPubSub({ publisher: client(), subscriber: client(), prefix });
    await sub.connect();
    await pub.connect();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = await sub.subscribe("room", (m) => a.push(m));
    await sub.subscribe("room", (m) => b.push(m));

    await pub.publish("room", 1);
    await settle();
    offA();
    await settle();
    await pub.publish("room", 2);
    await settle();

    expect(a).toEqual([1]);
    expect(b).toEqual([1, 2]);
  });

  it("delivers once after connect() is called twice", async () => {
    const sub = createRedisPubSub({ publisher: client(), subscriber: client(), prefix });
    const pub = createRedisPubSub({ publisher: client(), subscriber: client(), prefix });
    await sub.connect();
    await sub.connect();
    await pub.connect();
    const got: unknown[] = [];
    await sub.subscribe("t", (m) => got.push(m));

    await pub.publish("t", { n: 42 });
    await settle();

    expect(got).toEqual([{ n: 42 }]);
  });
});

describe.skipIf(!available)("createRedisPresence", () => {
  it("does not bring a swept connection back on its next heartbeat", async () => {
    const redis = client();
    const presence = createRedisPresence({ redis, prefix });
    await presence.connect();
    await presence.track("room", { connectionId: "c1", userId: "alice", metadata: {} } as never);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await presence.sweep("room", 1);
    await presence.heartbeat("room", "c1");

    expect(await redis.zscore(`${prefix}score:room`, "c1")).toBeNull();
  });

  it("sweeps a topic holding more stale connections than Lua can unpack at once", async () => {
    const redis = client();
    const presence = createRedisPresence({ redis, prefix });
    await presence.connect();
    const count = 8200;
    const pipeline = redis.pipeline();
    for (let i = 0; i < count; i += 1) {
      pipeline.zadd(`${prefix}score:big`, "1", `c${i}`);
      pipeline.hset(`${prefix}meta:big`, `c${i}`, JSON.stringify({ userId: `u${i}`, joinedAt: 1, metadata: {} }));
    }
    await pipeline.exec();

    const swept = await presence.sweep("big", 1000);

    expect(swept).toHaveLength(count);
    expect(await redis.zcard(`${prefix}score:big`)).toBe(0);
  });

  it("stops calling error handlers once disconnected, and leaves no listener behind", async () => {
    const redis = client();
    redis.on("error", () => undefined); // the app's own listener, as any app has
    const baseline = redis.listenerCount("error");
    const presence = createRedisPresence({ redis, prefix });
    await presence.connect();
    let calls = 0;
    presence.onError(() => {
      calls += 1;
    });
    presence.onError(() => {
      calls += 1;
    });

    await presence.disconnect();
    redis.emit("error", new Error("after disconnect"));

    expect(calls).toBe(0);
    expect(redis.listenerCount("error")).toBe(baseline);
  });
});
