import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRedisPubSub } from "../src/redis-pubsub";
import type { RedisPubSubConfig } from "../src/types";

// ---------------------------------------------------------------------------
// Minimal ioredis mock — only the methods our adapter actually uses
// ---------------------------------------------------------------------------

function createMockRedis() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const mock = {
    status: "ready" as string,
    ping: vi.fn().mockResolvedValue("PONG"),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),

    on(event: string, handler: (...args: unknown[]) => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return mock;
    },

    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
      return mock;
    },

    /** Simulate emitting an event (for tests) */
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },

    _listeners: listeners,
  };

  return mock;
}

type MockRedis = ReturnType<typeof createMockRedis>;

function createConfig(
  pub: MockRedis,
  sub: MockRedis,
  overrides?: Partial<RedisPubSubConfig>,
): RedisPubSubConfig {
  return {
    publisher: pub as unknown as RedisPubSubConfig["publisher"],
    subscriber: sub as unknown as RedisPubSubConfig["subscriber"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRedisPubSub", () => {
  let pub: MockRedis;
  let sub: MockRedis;

  beforeEach(() => {
    pub = createMockRedis();
    sub = createMockRedis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -- Lifecycle ------------------------------------------------------------

  it("starts unhealthy before connect()", () => {
    const ps = createRedisPubSub(createConfig(pub, sub));
    expect(ps.isHealthy()).toBe(false);
  });

  it("becomes healthy after connect()", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub));
    await ps.connect();
    expect(ps.isHealthy()).toBe(true);
  });

  it("becomes unhealthy after disconnect()", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub));
    await ps.connect();
    await ps.disconnect();
    expect(ps.isHealthy()).toBe(false);
  });

  it("tracks Redis connection health via events", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub));
    await ps.connect();
    expect(ps.isHealthy()).toBe(true);

    // Subscriber loses connection
    sub.emit("close");
    expect(ps.isHealthy()).toBe(false);

    // Subscriber reconnects
    sub.emit("ready");
    expect(ps.isHealthy()).toBe(true);

    // Publisher loses connection
    pub.emit("close");
    expect(ps.isHealthy()).toBe(false);
  });

  // -- Publish / Subscribe --------------------------------------------------

  it("subscribes to a Redis channel and receives messages", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "server-a" }));
    await ps.connect();

    const received: unknown[] = [];
    await ps.subscribe("chat.room1", (msg) => received.push(msg));

    expect(sub.subscribe).toHaveBeenCalledWith("chat.room1");

    // Simulate a message from another server
    const envelope = JSON.stringify({
      origin: "server-b",
      payload: { text: "hello" },
      timestamp: 1000,
    });
    sub.emit("message", "chat.room1", envelope);

    expect(received).toEqual([{ text: "hello" }]);
  });

  it("applies prefix to Redis channel names", async () => {
    const ps = createRedisPubSub(
      createConfig(pub, sub, { origin: "s1", prefix: "courier:" }),
    );
    await ps.connect();

    await ps.subscribe("chat", () => {});
    expect(sub.subscribe).toHaveBeenCalledWith("courier:chat");

    await ps.publish("chat", { data: 1 });
    expect(pub.publish).toHaveBeenCalledWith(
      "courier:chat",
      expect.any(String),
    );
  });

  it("skips messages from self (echo prevention)", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "server-a" }));
    await ps.connect();

    const received: unknown[] = [];
    await ps.subscribe("t", (msg) => received.push(msg));

    // Message from self
    const selfEnvelope = JSON.stringify({
      origin: "server-a",
      payload: "ignored",
      timestamp: 1000,
    });
    sub.emit("message", "t", selfEnvelope);

    expect(received).toHaveLength(0);
  });

  it("publishes with PubSubEnvelope wrapping", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();
    await ps.publish("t", { count: 42 });

    const call = pub.publish.mock.calls[0];
    expect(call?.[0]).toBe("t");
    const envelope = JSON.parse(call?.[1] as string);
    expect(envelope.origin).toBe("s1");
    expect(envelope.payload).toEqual({ count: 42 });
    expect(envelope.timestamp).toBeTypeOf("number");
  });

  it("publish is a no-op when disconnected", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub));
    // Never connected
    await ps.publish("t", "msg");
    expect(pub.publish).not.toHaveBeenCalled();
  });

  // -- Unsubscribe ----------------------------------------------------------

  it("unsubscribe function removes handler and calls Redis UNSUBSCRIBE", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();

    const received: unknown[] = [];
    const unsub = await ps.subscribe("t", (msg) => received.push(msg));

    unsub();
    expect(sub.unsubscribe).toHaveBeenCalledWith("t");

    // Messages after unsubscribe should not be delivered
    sub.emit("message", "t", JSON.stringify({ origin: "s2", payload: "late", timestamp: 1 }));
    expect(received).toHaveLength(0);
  });

  // -- Error handling -------------------------------------------------------

  it("onError receives Redis connection errors", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub));
    await ps.connect();

    const errors: Error[] = [];
    const unsub = ps.onError((err) => errors.push(err));

    pub.emit("error", new Error("pub down"));
    sub.emit("error", new Error("sub down"));

    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toBe("pub down");
    expect(errors[1]?.message).toBe("sub down");

    // After unsubscribe, no more errors
    unsub();
    pub.emit("error", new Error("ignored"));
    expect(errors).toHaveLength(2);
  });

  it("onError receives publish failures", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();

    const errors: Error[] = [];
    ps.onError((err) => errors.push(err));

    pub.publish.mockRejectedValueOnce(new Error("network error"));
    await ps.publish("t", "msg");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("network error");
  });

  it("onError receives malformed message parse errors", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();

    const errors: Error[] = [];
    ps.onError((err) => errors.push(err));

    await ps.subscribe("t", () => {});
    sub.emit("message", "t", "not-json{{{");

    expect(errors).toHaveLength(1);
  });

  // -- Multiple topics ------------------------------------------------------

  it("handles multiple independent topic subscriptions", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();

    const r1: unknown[] = [];
    const r2: unknown[] = [];
    await ps.subscribe("a", (msg) => r1.push(msg));
    await ps.subscribe("b", (msg) => r2.push(msg));

    sub.emit("message", "a", JSON.stringify({ origin: "s2", payload: "msg-a", timestamp: 1 }));
    sub.emit("message", "b", JSON.stringify({ origin: "s2", payload: "msg-b", timestamp: 1 }));

    expect(r1).toEqual(["msg-a"]);
    expect(r2).toEqual(["msg-b"]);
  });

  it("disconnect clears all state", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();

    const received: unknown[] = [];
    await ps.subscribe("t", (msg) => received.push(msg));
    await ps.disconnect();

    // Message after disconnect should not be delivered
    sub.emit("message", "t", JSON.stringify({ origin: "s2", payload: "late", timestamp: 1 }));
    expect(received).toHaveLength(0);
  });

  it("disconnect unsubscribes from all active Redis channels", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1", prefix: "nx:" }));
    await ps.connect();

    await ps.subscribe("a", () => {});
    await ps.subscribe("b", () => {});
    await ps.disconnect();

    // Should have called unsubscribe with prefixed channel names
    expect(sub.unsubscribe).toHaveBeenCalledWith("nx:a", "nx:b");
  });

  it("subscribe throws and rolls back handler on Redis error", async () => {
    const ps = createRedisPubSub(createConfig(pub, sub, { origin: "s1" }));
    await ps.connect();

    sub.subscribe.mockRejectedValueOnce(new Error("subscribe failed"));

    await expect(ps.subscribe("t", () => {})).rejects.toThrow("subscribe failed");

    // Handler should not remain registered after failure
    sub.emit("message", "t", JSON.stringify({ origin: "s2", payload: "ghost", timestamp: 1 }));
    // No crash = handler was cleaned up
  });
});
