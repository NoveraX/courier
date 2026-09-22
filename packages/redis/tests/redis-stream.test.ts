import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRedisStream } from "../src/redis-stream";
import type { RedisStreamConfig } from "../src/types";

// ---------------------------------------------------------------------------
// Minimal ioredis mock — only XADD / XRANGE / XTRIM
// ---------------------------------------------------------------------------

function createMockRedis() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let idCounter = 0;

  // In-memory streams for realistic mock behavior
  const streams = new Map<string, [string, string[]][]>();

  const mock = {
    status: "ready" as string,
    async ping(): Promise<string> {
      return "PONG";
    },

    xadd: vi.fn(async (...args: unknown[]) => {
      idCounter++;
      const id = `${1700000000000 + idCounter}-0`;

      // Find the key (first arg) and extract fields
      const key = args[0] as string;
      let entries = streams.get(key);
      if (!entries) {
        entries = [];
        streams.set(key, entries);
      }

      // Find fields after "*" or MAXLEN args
      const starIdx = args.indexOf("*");
      const fields = args.slice(starIdx + 1) as string[];
      entries.push([id, fields]);

      return id;
    }),

    xrange: vi.fn(async (key: string, start: string, _end: string, ...rest: unknown[]) => {
      const entries = streams.get(key) ?? [];
      let count = Infinity;
      if (rest[0] === "COUNT") {
        count = rest[1] as number;
      }

      // Filter entries after start ID (exclusive with "(" prefix)
      const exclusiveStart = start.startsWith("(") ? start.slice(1) : null;
      const filtered = entries.filter(([id]) => {
        if (exclusiveStart) return id > exclusiveStart;
        if (start === "-") return true;
        return id >= start;
      });

      return filtered.slice(0, count);
    }),

    xtrim: vi.fn(async (key: string, _type: string, maxLen: number) => {
      const entries = streams.get(key);
      if (!entries) return 0;
      if (entries.length > maxLen) {
        const removed = entries.length - maxLen;
        entries.splice(0, removed);
        return removed;
      }
      return 0;
    }),

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

    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },

    _streams: streams,
    _listeners: listeners,
  };

  return mock;
}

type MockRedis = ReturnType<typeof createMockRedis>;

function createConfig(
  redis: MockRedis,
  overrides?: Partial<RedisStreamConfig>,
): RedisStreamConfig {
  return {
    redis: redis as unknown as RedisStreamConfig["redis"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRedisStream", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -- Lifecycle ------------------------------------------------------------

  it("starts unhealthy before connect()", () => {
    const s = createRedisStream(createConfig(redis));
    expect(s.isHealthy()).toBe(false);
  });

  it("becomes healthy after connect()", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();
    expect(s.isHealthy()).toBe(true);
  });

  it("becomes unhealthy after disconnect()", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();
    await s.disconnect();
    expect(s.isHealthy()).toBe(false);
  });

  it("tracks Redis health via events", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();
    expect(s.isHealthy()).toBe(true);

    redis.emit("close");
    expect(s.isHealthy()).toBe(false);

    redis.emit("ready");
    expect(s.isHealthy()).toBe(true);
  });

  // -- Append ---------------------------------------------------------------

  it("appends events with XADD and returns stream ID", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    const id = await s.append("events.chat", {
      data: { text: "hello" },
      timestamp: 1000,
    });

    expect(id).toMatch(/^\d+-\d+$/);
    expect(redis.xadd).toHaveBeenCalled();
  });

  it("includes optional event field in XADD", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    await s.append("t", {
      event: "user_joined",
      data: { userId: "1" },
      timestamp: 1000,
    });

    const call = redis.xadd.mock.calls[0]!;
    const args = call as unknown[];
    expect(args).toContain("event");
    expect(args).toContain("user_joined");
  });

  it("applies prefix to stream keys", async () => {
    const s = createRedisStream(createConfig(redis, { prefix: "courier:stream:" }));
    await s.connect();

    await s.append("chat", { data: "msg", timestamp: 1 });

    const call = redis.xadd.mock.calls[0]!;
    expect(call[0]).toBe("courier:stream:chat");
  });

  it("uses approximate MAXLEN on append", async () => {
    const s = createRedisStream(createConfig(redis, { maxLen: 500 }));
    await s.connect();

    await s.append("t", { data: "msg", timestamp: 1 });

    const call = redis.xadd.mock.calls[0]!;
    const args = call as unknown[];
    expect(args).toContain("MAXLEN");
    expect(args).toContain("~");
    expect(args).toContain(500);
  });

  it("skips MAXLEN when maxLen is 0", async () => {
    const s = createRedisStream(createConfig(redis, { maxLen: 0 }));
    await s.connect();

    await s.append("t", { data: "msg", timestamp: 1 });

    const call = redis.xadd.mock.calls[0]!;
    const args = call as unknown[];
    expect(args).not.toContain("MAXLEN");
  });

  // -- getHistory -----------------------------------------------------------

  it("retrieves history with exclusive start (afterId)", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    // Append 3 events
    const id1 = await s.append("t", { data: "a", timestamp: 1 });
    const id2 = await s.append("t", { data: "b", timestamp: 2 });
    await s.append("t", { data: "c", timestamp: 3 });

    // Get events after id1
    const history = await s.getHistory("t", id1);

    expect(history).toHaveLength(2);
    expect(history[0]!.data).toBe("b");
    expect(history[0]!.id).toBe(id2);
    expect(history[1]!.data).toBe("c");
  });

  it("uses exclusive start with ( prefix in XRANGE", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    await s.getHistory("t", "1700000000001-0");

    const call = redis.xrange.mock.calls[0]!;
    expect(call[1]).toBe("(1700000000001-0");
    expect(call[2]).toBe("+");
  });

  it("respects limit parameter", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    for (let i = 0; i < 5; i++) {
      await s.append("t", { data: `msg-${i}`, timestamp: i });
    }

    const history = await s.getHistory("t", "0", 2);
    expect(history).toHaveLength(2);
  });

  it("returns empty array for non-existent topic", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    const history = await s.getHistory("nonexistent", "0");
    expect(history).toEqual([]);
  });

  it("applies prefix to getHistory key", async () => {
    const s = createRedisStream(createConfig(redis, { prefix: "nx:" }));
    await s.connect();

    await s.getHistory("chat", "0");
    expect(redis.xrange.mock.calls[0]![0]).toBe("nx:chat");
  });

  // -- Trim -----------------------------------------------------------------

  it("trims stream to specified maxLen", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    await s.trim("t", 100);

    expect(redis.xtrim).toHaveBeenCalledWith("t", "MAXLEN", 100);
  });

  it("applies prefix to trim key", async () => {
    const s = createRedisStream(createConfig(redis, { prefix: "nx:" }));
    await s.connect();

    await s.trim("chat", 50);
    expect(redis.xtrim).toHaveBeenCalledWith("nx:chat", "MAXLEN", 50);
  });

  // -- Error handling -------------------------------------------------------

  it("onError receives Redis errors", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    const errors: Error[] = [];
    const unsub = s.onError((err) => errors.push(err));

    redis.emit("error", new Error("connection lost"));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("connection lost");

    unsub();
    redis.emit("error", new Error("ignored"));
    expect(errors).toHaveLength(1);
  });

  it("getHistory returns empty array on Redis error", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    redis.xrange.mockRejectedValueOnce(new Error("timeout"));

    const errors: Error[] = [];
    s.onError((err) => errors.push(err));

    const history = await s.getHistory("t", "0");
    expect(history).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("append propagates errors after emitting", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    redis.xadd.mockRejectedValueOnce(new Error("write failed"));

    const errors: Error[] = [];
    s.onError((err) => errors.push(err));

    await expect(s.append("t", { data: "x", timestamp: 1 })).rejects.toThrow("write failed");
    expect(errors).toHaveLength(1);
  });

  it("trim emits error on Redis failure without throwing", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    redis.xtrim.mockRejectedValueOnce(new Error("trim failed"));

    const errors: Error[] = [];
    s.onError((err) => errors.push(err));

    // trim should not throw — soft failure
    await s.trim("t", 100);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("trim failed");
  });

  // -- Parsed events --------------------------------------------------------

  it("parses XRANGE entries into StoredEvent format", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    await s.append("t", {
      event: "notification",
      data: { userId: "42" },
      timestamp: 1700000000000,
    });

    const history = await s.getHistory("t", "0");
    expect(history).toHaveLength(1);

    const evt = history[0]!;
    expect(evt.id).toMatch(/^\d+-\d+$/);
    expect(evt.event).toBe("notification");
    expect(evt.data).toEqual({ userId: "42" });
    expect(evt.timestamp).toBe(1700000000000);
  });

  it("handles events without optional event field", async () => {
    const s = createRedisStream(createConfig(redis));
    await s.connect();

    await s.append("t", { data: "simple", timestamp: 1 });

    const history = await s.getHistory("t", "0");
    expect(history[0]!.event).toBeUndefined();
    expect(history[0]!.data).toBe("simple");
  });
});
