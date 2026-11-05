/**
 * The log a Redis pub/sub adapter keeps with `log`: one sequence a topic
 * for every replica, numbered by Redis in the script that publishes the
 * event, which reaches every replica subscribed, its sender too; a read
 * sends back a range of what is kept, and none for another epoch, past
 * the sequence, or what was trimmed; a sequence whose keys Redis lost
 * begins anew in another epoch; a topic's two keys share a hash slot and
 * expire `ttlMs` after its last event; and while Redis is away, what is
 * appended waits in order, as what is published does.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { ConfigurationError } from "@noverax/courier";
import type { LoggedPosition, PubSubAdapter, TopicLog } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPubSub } from "../src/redis-pubsub";
import type { RedisTopicLogOptions } from "../src/redis-topic-log";
import { REDIS_URL, redisAnswers, redisClients } from "./helpers/redis-clients";
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

/** A replica's adapter, with a log, on clients of its own — its publisher through `through` when given. */
function replica(log: RedisTopicLogOptions = {}, through?: RedisRelay) {
  const adapter = createRedisPubSub({
    publisher: redis.client(through),
    subscriber: redis.client(),
    prefix: redis.prefix,
    log,
  });
  adapters.push(adapter);
  return { adapter, log: adapter.log as TopicLog };
}

/** What a replica's subscription to `topic` hears, once Redis confirmed it. */
async function listen(adapter: PubSubAdapter, topic = "room") {
  const heard: Array<[unknown, LoggedPosition | undefined]> = [];
  const before = adapter.stats().channels.confirmed;
  await adapter.subscribe(topic, (message, logged) => heard.push([message, logged]));
  await expect.poll(() => adapter.stats().channels.confirmed).toBe(before + 1);
  return heard;
}

async function logKeys(): Promise<string[]> {
  return (await redis.client().keys(`${redis.prefix}courier:log:*`)).sort();
}

describe.skipIf(!available)("a Redis adapter's topic log", { timeout: 20_000 }, () => {
  it("numbers a topic's events once for every replica, and sends each to all, its sender too", async () => {
    const a = replica();
    const b = replica();
    const [onA, onB] = [await listen(a.adapter), await listen(b.adapter)];

    await a.log.append("room", "one");
    await b.log.append("room", { text: "two" }, "conn-9");

    const { epoch } = await a.log.position("room");
    for (const heard of [onA, onB]) {
      await expect
        .poll(() => heard)
        .toEqual([
          ["one", { seq: 1, epoch }],
          [{ text: "two" }, { seq: 2, epoch, exclude: "conn-9" }],
        ]);
    }
    expect(await b.log.position("room")).toEqual({ seq: 2, epoch });
  });

  it("sends back a range it keeps, and none for another epoch, past its sequence or trimmed", async () => {
    const { log } = replica({ maxEvents: 10 });
    for (let i = 1; i <= 250; i++) await log.append("room", i);
    const { epoch } = await log.position("room");

    expect(await log.read("room", { seq: 245, epoch }, 250)).toEqual(
      [246, 247, 248, 249, 250].map((seq) => ({ seq, epoch, payload: seq })),
    );
    expect(await log.read("room", { seq: 250, epoch }, 250)).toEqual([]);
    expect(await log.read("room", { seq: 1, epoch }, 2)).toBeUndefined();
    expect(await log.read("room", { seq: 249, epoch }, 251)).toBeUndefined();
    expect(await log.read("room", { seq: 245, epoch: `${epoch}x` }, 250)).toBeUndefined();
    expect(await log.read("room", { seq: 0, epoch }, 250)).toBeUndefined();
  });

  it("begins a sequence anew, in another epoch, once Redis lost its keys", async () => {
    const { adapter, log } = replica();
    const heard = await listen(adapter);
    await log.append("room", "before");
    const before = await log.position("room");

    await redis.client().del(...(await logKeys()));
    await log.append("room", "after");

    await expect.poll(() => heard).toHaveLength(2);
    const [, logged] = heard[1] ?? [];
    expect(logged?.seq).toBe(1);
    expect(logged?.epoch).not.toBe(before.epoch);
    expect(await log.read("room", before, 1)).toBeUndefined();
  });

  it("keeps a topic's two keys in one hash slot, for ttlMs after its last event", async () => {
    const { adapter, log } = replica({ ttlMs: 5_000 });
    await adapter.connect();

    await log.append('api.chat.room#{"room":"a"}', "hi");

    const keys = await logKeys();
    expect(keys).toHaveLength(2);
    const tags = keys.map((key) => /\{([^}]*)\}/.exec(key)?.[1]);
    expect(tags[0]).toMatch(/^[0-9a-f]{40}$/);
    expect(tags[1]).toBe(tags[0]);
    for (const key of keys) {
      const left = await redis.client().pttl(key);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(5_000);
    }
  });

  it("holds what is appended while Redis is away, and appends it in order once back", async () => {
    const listener = replica();
    const heard = await listen(listener.adapter);
    const outage = await startRelay(new URL(REDIS_URL));
    relays.push(outage);
    outage.set("down");
    const { adapter, log } = replica({}, outage);

    for (const text of ["one", "two", "three"]) await log.append("room", text);
    expect(adapter.stats().queued.messages).toBe(3);
    outage.set("up");

    await expect
      .poll(() => heard.map(([message, logged]) => [message, logged?.seq]), { timeout: 3_000 })
      .toEqual([
        ["one", 1],
        ["two", 2],
        ["three", 3],
      ]);
    expect(adapter.stats()).toMatchObject({ published: 3, dropped: 0 });
  });

  it("refuses an append once the adapter is stopped", async () => {
    const { adapter, log } = replica();
    await adapter.disconnect();

    await expect(log.append("room", "late")).rejects.toThrow(/stopped with disconnect/);
  });

  it.each([
    ["no events", { maxEvents: 0 }],
    ["part of an event", { maxEvents: 1.5 }],
    ["less than a second", { ttlMs: 999 }],
  ])("refuses to keep %s", (_what, log) => {
    expect(() =>
      createRedisPubSub({ publisher: redis.client(), subscriber: redis.client(), log }),
    ).toThrow(ConfigurationError);
  });
});
