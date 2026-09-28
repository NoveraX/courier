/**
 * The ZSET and HASH make presence state shared, so any replica can list a
 * topic and see what the others wrote. Notifications were not: the diff
 * emitter dispatched to handlers registered on one instance, so a replica
 * learned only about the joins and leaves it had handled itself — and a
 * presence UI on the deployment this package exists for missed everything
 * that happened elsewhere.
 */
import type { PresenceDiff } from "@noverax/courier/realtime";
import { describe, expect, it, vi } from "vitest";

import { createRedisPresence } from "../src/redis-presence";

/** One Redis, shared by every client the test makes, with real pub/sub. */
function createBus() {
  const channels = new Map<string, Set<(channel: string, message: string) => void>>();

  return {
    /** Publish as a process that is no replica would. */
    publish(channel: string, message: string) {
      for (const listener of channels.get(channel) ?? []) listener(channel, message);
    },
    client() {
      const listeners = new Set<(channel: string, message: string) => void>();
      const subscribed = new Set<string>();
      const mock = {
        status: "ready" as string,
        ping: vi.fn().mockResolvedValue("PONG"),
        on(event: string, handler: (channel: string, message: string) => void) {
          if (event === "message") listeners.add(handler);
          return mock;
        },
        off() {
          return mock;
        },
        async subscribe(channel: string) {
          subscribed.add(channel);
          let set = channels.get(channel);
          if (!set) {
            set = new Set();
            channels.set(channel, set);
          }
          for (const listener of listeners) set.add(listener);
        },
        async unsubscribe(channel: string) {
          subscribed.delete(channel);
          for (const listener of listeners) channels.get(channel)?.delete(listener);
        },
        async publish(channel: string, message: string) {
          for (const listener of channels.get(channel) ?? []) listener(channel, message);
          return 1;
        },
        pipeline: () => ({ zadd: () => undefined, hset: () => undefined, exec: async () => [] }),
        async hget() {
          return null;
        },
        async zrangebyscore() {
          return [];
        },
      };
      return mock as never;
    },
  };
}

const entry = { connectionId: "c1", userId: "u1", metadata: {} } as never;

describe("a diff raised on one replica", () => {
  it("reaches a handler registered on another", async () => {
    const bus = createBus();
    const a = createRedisPresence({ redis: bus.client(), subscriber: bus.client(), prefix: "p:" });
    const b = createRedisPresence({ redis: bus.client(), subscriber: bus.client(), prefix: "p:" });
    await a.connect();
    await b.connect();

    const seen: PresenceDiff[] = [];
    b.onDiff("lobby", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 10));

    await a.track("lobby", entry);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.joins[0]?.userId).toBe("u1");
  });

  /** A replica has already run its own handlers before it publishes. */
  it("does not come back to the replica that raised it", async () => {
    const bus = createBus();
    const a = createRedisPresence({ redis: bus.client(), subscriber: bus.client(), prefix: "p:" });
    await a.connect();

    const seen: PresenceDiff[] = [];
    a.onDiff("lobby", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 10));

    await a.track("lobby", entry);

    expect(seen).toHaveLength(1);
  });

  it("stops arriving once the last handler goes", async () => {
    const bus = createBus();
    const a = createRedisPresence({ redis: bus.client(), subscriber: bus.client(), prefix: "p:" });
    const b = createRedisPresence({ redis: bus.client(), subscriber: bus.client(), prefix: "p:" });
    await a.connect();
    await b.connect();

    const seen: PresenceDiff[] = [];
    const off = b.onDiff("lobby", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 10));
    off();
    await new Promise((r) => setTimeout(r, 10));

    await a.track("lobby", entry);

    expect(seen).toHaveLength(0);
  });

  /** Another process may publish on the channel, or an entry arrive cut short. */
  it("is reported, and not delivered, when it is no whole presence change", async () => {
    const bus = createBus();
    const b = createRedisPresence({ redis: bus.client(), subscriber: bus.client(), prefix: "p:" });
    await b.connect();
    const errors: Error[] = [];
    b.onError((err) => errors.push(err));
    const seen: PresenceDiff[] = [];
    b.onDiff("lobby", (d) => seen.push(d));
    await new Promise((r) => setTimeout(r, 10));

    const cutShort = { origin: "other", topic: "lobby", diff: { joins: [{ userId: "u1" }], leaves: [] } };
    bus.publish("p:diff:lobby", JSON.stringify(cutShort));

    expect(seen).toHaveLength(0);
    expect(errors.map((err) => err.message)).toEqual(['Not a Courier presence change on channel "p:diff:lobby"']);
  });

  /** Without a second connection there is nothing to listen on, and the
      adapter must keep working rather than pretend or throw. */
  it("stays local when no subscriber connection is given", async () => {
    const bus = createBus();
    const a = createRedisPresence({ redis: bus.client(), prefix: "p:" });
    await a.connect();

    const seen: PresenceDiff[] = [];
    a.onDiff("lobby", (d) => seen.push(d));
    await a.track("lobby", entry);

    expect(seen).toHaveLength(1);
  });
});

describe("connect", () => {
  it("reports a Redis that does not answer", async () => {
    const dead = {
      status: "end",
      ping: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      on: () => dead,
      off: () => dead,
    };

    const adapter = createRedisPresence({ redis: dead as never, prefix: "p:" });

    await expect(adapter.connect()).rejects.toThrow(/ECONNREFUSED/);
    expect(adapter.isHealthy()).toBe(false);
  });

  it("verifies the subscriber connection too", async () => {
    const good = { status: "ready", ping: vi.fn().mockResolvedValue("PONG"), on: () => good, off: () => good };
    const bad = {
      status: "end",
      ping: vi.fn().mockRejectedValue(new Error("subscriber is down")),
      on: () => bad,
      off: () => bad,
    };

    const adapter = createRedisPresence({ redis: good as never, subscriber: bad as never, prefix: "p:" });

    await expect(adapter.connect()).rejects.toThrow(/subscriber is down/);
  });
});
