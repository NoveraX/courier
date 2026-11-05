/**
 * The Redis presence adapter through outages: it works before connect(),
 * hears the other replicas' diffs once Redis is there, and again after its
 * connections are cut or its subscription was refused, and stops within its
 * deadline while Redis hangs. A TCP relay in front of the test's Redis
 * stands for Redis away.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { randomUUID } from "node:crypto";
import type { PresenceAdapter, PresenceDiff } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPresence } from "../src/redis-presence";
import { type ClientOptions, REDIS_URL, redisAnswers, redisClients } from "./helpers/redis-clients";
import { type RedisRelay, startRelay } from "./helpers/redis-relay";

const available = await redisAnswers();
const redis = redisClients();
const relays: RedisRelay[] = [];
const adapters: PresenceAdapter[] = [];

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

/** A replica's presence on clients of its own, through `through` when given. */
function replica(through?: RedisRelay, subscriberOptions?: ClientOptions): PresenceAdapter {
  const adapter = createRedisPresence({
    redis: redis.client(through),
    subscriber: redis.client(through, subscriberOptions),
    prefix: redis.prefix,
  });
  adapters.push(adapter);
  return adapter;
}

/** What a replica hears of a topic's diffs. */
function hear(adapter: PresenceAdapter, topic = "room"): PresenceDiff[] {
  const heard: PresenceDiff[] = [];
  adapter.onDiff(topic, (diff) => heard.push(diff));
  return heard;
}

const alice = { userId: "alice", connectionId: "c-alice", metadata: {} };
const bob = { userId: "bob", connectionId: "c-bob", metadata: {} };
const joinsOf = (heard: PresenceDiff[]) => heard.flatMap((diff) => diff.joins.map((j) => j.userId));

describe.skipIf(!available)("createRedisPresence before connect()", { timeout: 20_000 }, () => {
  it("keeps what it is asked, and hears the other replicas, without connect() called", async () => {
    const a = replica();
    const heard = hear(a);
    const b = replica();
    await b.connect();

    await a.track("room", alice);
    await expect
      .poll(() => b.list("room").then((entries) => entries.map((e) => e.userId)))
      .toEqual(["alice"]);
    await expect
      .poll(async () => {
        await b.track("room", bob);
        return joinsOf(heard).includes("bob");
      })
      .toBe(true);
  });

  it("fails connect() at its deadline while Redis is down, and works once Redis is up", async () => {
    const outage = await relay();
    outage.set("down");
    const a = replica(outage);
    const heard = hear(a);

    await expect(a.connect({ timeoutMs: 300 })).rejects.toThrow(/did not answer within 300 ms/);
    outage.set("up");
    await a.connect();
    const b = replica();

    await expect
      .poll(async () => {
        await b.track("room", { ...bob, connectionId: randomUUID() });
        return joinsOf(heard).includes("bob");
      })
      .toBe(true);
  });
});

describe.skipIf(!available)("createRedisPresence after an outage", { timeout: 20_000 }, () => {
  it("hears the other replicas again once its connections are cut and made anew", async () => {
    const cuttable = await relay();
    const a = replica(cuttable);
    const heard = hear(a);
    await a.connect();

    cuttable.cut();
    const b = replica();

    await expect
      .poll(
        async () => {
          await b.track("room", { ...bob, connectionId: randomUUID() });
          return joinsOf(heard).includes("bob");
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  });

  it("makes a diff subscription Redis refused, once Redis allows it", async () => {
    const admin = redis.client();
    const user = `courier-test-${randomUUID()}`;
    await admin.call("ACL", "SETUSER", user, "on", ">secret", "~*", "&*", "+@all", "-subscribe");
    try {
      const a = replica(undefined, { username: user, password: "secret" });
      const errors: Error[] = [];
      a.onError((error) => errors.push(error));
      const heard = hear(a);
      await expect.poll(() => errors.length, { timeout: 3_000 }).toBeGreaterThan(0);
      expect(errors[0]?.message).toMatch(/NOPERM/);

      await admin.call("ACL", "SETUSER", user, "+subscribe");
      const b = replica();

      await expect
        .poll(
          async () => {
            await b.track("room", { ...bob, connectionId: randomUUID() });
            return joinsOf(heard).includes("bob");
          },
          { timeout: 8_000 },
        )
        .toBe(true);
    } finally {
      await admin.call("ACL", "DELUSER", user);
    }
  });

  it("settles disconnect() within its deadline while Redis hangs", async () => {
    const hanging = await relay();
    const a = replica(hanging);
    hear(a);
    await a.connect();
    hanging.set("silent");
    hanging.cut();

    const started = Date.now();
    await a.disconnect({ timeoutMs: 300 });

    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
