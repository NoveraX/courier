/**
 * The Redis pub/sub adapter when Redis is not there: before `connect()`,
 * while Redis is down at start, after its connections are cut, when Redis
 * refuses a SUBSCRIBE, and when the replica shuts down with Redis
 * unreachable. A TCP relay in front of the test's Redis stands for an
 * outage: it ends each connection it is offered while "down", holds them
 * unanswered while "silent", and cuts those it carries as a restart does.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { randomUUID } from "node:crypto";

import { createWSHandler } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import type { PubSubAdapter } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPubSub } from "../src/redis-pubsub";
import { type ClientOptions, REDIS_URL, redisAnswers, redisClients } from "./helpers/redis-clients";
import { type RedisRelay, startRelay } from "./helpers/redis-relay";

const available = await redisAnswers();
const redis = redisClients();
const relays: RedisRelay[] = [];
const adapters: PubSubAdapter[] = [];

afterEach(async () => {
  await Promise.all(adapters.splice(0).map((adapter) => adapter.disconnect({ timeoutMs: 500 })));
  await redis.end();
  for (const relay of relays.splice(0)) await relay.close();
});

async function relay(): Promise<RedisRelay> {
  const started = await startRelay(new URL(REDIS_URL));
  relays.push(started);
  return started;
}

/** A replica's adapter on clients of its own, through `through` when given. */
function replica(through?: RedisRelay, options?: ClientOptions) {
  const publisher = redis.client(through, options);
  const subscriber = redis.client(through, options);
  const adapter = createRedisPubSub({ publisher, subscriber, prefix: redis.prefix });
  adapters.push(adapter);
  return { adapter, publisher, subscriber };
}

/** What a replica's subscription to `channel` hears. */
async function listen(adapter: PubSubAdapter, channel = "room"): Promise<unknown[]> {
  const heard: unknown[] = [];
  await adapter.subscribe(channel, (message) => heard.push(message));
  return heard;
}

async function ready(client: Redis): Promise<void> {
  await expect.poll(() => client.status, { timeout: 5000 }).toBe("ready");
}

/** Wait for a promise, or say it was still waiting at `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | "still waiting"> {
  return Promise.race([
    promise,
    new Promise<"still waiting">((resolve) => setTimeout(() => resolve("still waiting"), ms)),
  ]);
}

describe.skipIf(!available)("createRedisPubSub before connect()", { timeout: 20_000 }, () => {
  it("delivers what another replica publishes to a subscriber made before connect()", async () => {
    const a = replica();
    const b = replica();
    await a.adapter.connect();
    const heard = await listen(b.adapter);
    await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);

    await a.adapter.publish("room", "hello");

    await expect.poll(() => heard, { timeout: 2000 }).toEqual(["hello"]);
  });

  it("sends what it was asked to publish before it was ready", async () => {
    const b = replica();
    await b.adapter.connect();
    const heard = await listen(b.adapter);
    await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);
    const a = replica();

    await a.adapter.publish("room", "early");

    await expect.poll(() => heard, { timeout: 2000 }).toEqual(["early"]);
  });
});

describe.skipIf(!available)(
  "createRedisPubSub with Redis down at start",
  { timeout: 20_000 },
  () => {
    it("fails connect() at its deadline, then hears the other replicas once Redis is up", async () => {
      const outage = await relay();
      outage.set("down");
      const b = replica(outage);

      await expect(b.adapter.connect({ timeoutMs: 300 })).rejects.toThrow(
        /not ready within 300 ms/,
      );
      const heard = await listen(b.adapter);
      outage.set("up");
      await b.adapter.connect();
      await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);
      const a = replica();
      await a.adapter.publish("room", "after the outage");

      await expect.poll(() => heard, { timeout: 3000 }).toEqual(["after the outage"]);
    });

    it("sends what it published while Redis was down, in order, once Redis is up", async () => {
      const b = replica();
      await b.adapter.connect();
      const heard = await listen(b.adapter);
      await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);
      const outage = await relay();
      outage.set("down");
      const a = replica(outage);

      for (const message of [1, 2, 3]) await a.adapter.publish("room", message);
      expect(a.adapter.stats().queued.messages).toBe(3);
      outage.set("up");

      await expect.poll(() => heard, { timeout: 3000 }).toEqual([1, 2, 3]);
      expect(a.adapter.stats()).toMatchObject({ published: 3, dropped: 0 });
    });

    it("drops what waited longer than the queue keeps it, counting it", async () => {
      const outage = await relay();
      outage.set("down");
      const publisher = redis.client(outage);
      const adapter = createRedisPubSub({
        publisher,
        subscriber: redis.client(outage),
        prefix: redis.prefix,
        queue: { maxAgeMs: 50 },
      });
      adapters.push(adapter);

      await adapter.publish("room", "stale");
      const queuedAt = Date.now();
      /* It is older than the queue keeps it before Redis can take it. */
      await expect.poll(() => Date.now() - queuedAt).toBeGreaterThan(50);
      outage.set("up");
      await ready(publisher);

      await expect.poll(() => adapter.stats().dropped).toBe(1);
      expect(adapter.stats().published).toBe(0);
    });
  },
);

describe.skipIf(!available)(
  "createRedisPubSub after its connections are cut",
  { timeout: 20_000 },
  () => {
    it("still delivers once the subscriber has reconnected", async () => {
      const cuttable = await relay();
      const b = replica(cuttable);
      const a = replica();
      const heard = await listen(b.adapter);
      await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);
      await a.adapter.publish("room", "before");
      await expect.poll(() => heard, { timeout: 2000 }).toEqual(["before"]);

      const states: string[] = [];
      b.adapter.onStateChange((state) => states.push(state));

      cuttable.cut();
      await expect.poll(() => states, { timeout: 5000 }).toEqual(["degraded", "ready"]);
      await expect.poll(() => b.adapter.stats().channels.confirmed, { timeout: 5000 }).toBe(1);
      await a.adapter.publish("room", "after");

      await expect.poll(() => heard, { timeout: 3000 }).toEqual(["before", "after"]);
    });

    it("delivers to a subscription made during an outage once Redis is back", async () => {
      const outage = await relay();
      const b = replica(outage, { maxRetriesPerRequest: 1 });
      await b.adapter.connect();
      const a = replica();
      outage.set("down");
      outage.cut();
      await expect.poll(() => b.adapter.state).toBe("degraded");

      const heard = await listen(b.adapter);
      outage.set("up");
      await expect.poll(() => b.adapter.stats().channels.confirmed, { timeout: 5000 }).toBe(1);
      await a.adapter.publish("room", "after the outage");

      await expect.poll(() => heard, { timeout: 3000 }).toEqual(["after the outage"]);
    });

    it("is connecting, ready, degraded and ready again as its connections are", async () => {
      const outage = await relay();
      outage.set("down");
      const b = replica(outage);
      const states: string[] = [b.adapter.state];
      b.adapter.onStateChange((state) => states.push(state));

      outage.set("up");
      await b.adapter.connect();
      outage.set("down");
      outage.cut();
      await expect.poll(() => b.adapter.state).toBe("degraded");
      outage.set("up");
      await b.adapter.connect();

      expect(states).toEqual(["connecting", "ready", "degraded", "ready"]);
    });
  },
);

describe.skipIf(!available)(
  "createRedisPubSub when Redis refuses SUBSCRIBE",
  { timeout: 20_000 },
  () => {
    it("makes the subscription once Redis allows it", async () => {
      const admin = redis.client();
      const user = `courier-test-${randomUUID()}`;
      await admin.call("ACL", "SETUSER", user, "on", ">secret", "~*", "&*", "+@all", "-subscribe");
      try {
        const subscriber = redis.client(undefined, { username: user, password: "secret" });
        const adapter = createRedisPubSub({
          publisher: redis.client(),
          subscriber,
          prefix: redis.prefix,
        });
        adapters.push(adapter);
        const errors: Error[] = [];
        adapter.onError((error) => errors.push(error));
        await adapter.connect();
        const heard = await listen(adapter);
        await expect.poll(() => errors.length, { timeout: 2000 }).toBeGreaterThan(0);
        expect(errors[0]?.message).toMatch(/NOPERM/);

        await admin.call("ACL", "SETUSER", user, "+subscribe");
        await expect.poll(() => adapter.stats().channels.confirmed, { timeout: 5000 }).toBe(1);
        await replica().adapter.publish("room", "allowed now");

        await expect.poll(() => heard, { timeout: 3000 }).toEqual(["allowed now"]);
      } finally {
        await admin.call("ACL", "DELUSER", user);
      }
    });
  },
);

describe.skipIf(!available)(
  "createRedisPubSub shutting down with Redis unreachable",
  { timeout: 20_000 },
  () => {
    it("settles disconnect() within its deadline while Redis is down", async () => {
      const outage = await relay();
      const b = replica(outage, { maxRetriesPerRequest: null });
      await b.adapter.connect();
      await listen(b.adapter);
      await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);
      outage.set("down");
      outage.cut();

      expect(await within(b.adapter.disconnect({ timeoutMs: 500 }), 1500)).toBeUndefined();
      expect(b.adapter.state).toBe("stopped");
    });

    it("settles disconnect() within its deadline while Redis hangs", async () => {
      const outage = await relay();
      const b = replica(outage, { maxRetriesPerRequest: null });
      await b.adapter.connect();
      await listen(b.adapter);
      await expect.poll(() => b.adapter.stats().channels.confirmed).toBe(1);
      outage.set("silent");
      outage.cut();

      expect(await within(b.adapter.disconnect({ timeoutMs: 500 }), 1500)).toBeUndefined();
    });

    it("takes a subscription at once while Redis is down", async () => {
      const outage = await relay();
      const b = replica(outage, { maxRetriesPerRequest: null });
      await b.adapter.connect();
      outage.set("down");
      outage.cut();

      const taken = await within(
        b.adapter.subscribe("room", () => undefined).then(() => "taken"),
        500,
      );

      expect(taken).toBe("taken");
      expect(b.adapter.stats().channels).toEqual({ wanted: 1, confirmed: 0 });
    });

    it("lets a WebSocket handler's destroy() settle within a bound while Redis is unreachable", async () => {
      const outage = await relay();
      const { adapter } = replica(outage, { maxRetriesPerRequest: null });
      await adapter.connect();
      const handler = createWSHandler({
        pubsub: adapter,
        heartbeatIntervalMs: 60_000,
        sources: { api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) },
      });
      outage.set("down");
      outage.cut();
      const listeners = new Map<string, Array<(event: unknown) => void>>();
      /* A socket opened while Redis is away: the handler subscribes the replica for it. */
      handler.handleSocket(
        {
          readyState: 1,
          bufferedAmount: 0,
          send: () => undefined,
          close: () => undefined,
          addEventListener: (type: string, listener: (event: never) => void) => {
            listeners.set(type, [
              ...(listeners.get(type) ?? []),
              listener as (event: unknown) => void,
            ]);
          },
        },
        new Request("http://localhost/api/ws"),
        "203.0.113.5",
      );
      await expect.poll(() => handler.connections.count).toBe(1);

      expect(
        await within(
          handler.destroy().then(() => "settled"),
          1500,
        ),
      ).toBe("settled");
    });
  },
);
