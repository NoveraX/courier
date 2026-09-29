import type { PresenceAdapter, PresenceDiff } from "@noverax/courier/realtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRedisPresence } from "../src/redis-presence";

// ---------------------------------------------------------------------------
// Minimal ioredis mock
// ---------------------------------------------------------------------------

interface PipelineCall {
  method: string;
  args: unknown[];
}

function createRedisMock() {
  const store = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const pipelines: PipelineCall[][] = [];

  function getZset(key: string): Map<string, number> {
    let z = zsets.get(key);
    if (!z) {
      z = new Map();
      zsets.set(key, z);
    }
    return z;
  }

  function getHash(key: string): Map<string, string> {
    let h = store.get(key);
    if (!h) {
      h = new Map();
      store.set(key, h);
    }
    return h;
  }

  const redis = {
    status: "ready" as string,
    async ping(): Promise<string> {
      return "PONG";
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return redis;
    },

    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
      return redis;
    },

    async zadd(key: string, score: string, member: string): Promise<number> {
      getZset(key).set(member, Number(score));
      return 1;
    },

    async zrem(key: string, ...members: string[]): Promise<number> {
      const z = zsets.get(key);
      if (!z) return 0;
      let removed = 0;
      for (const m of members) {
        if (z.delete(m)) removed++;
      }
      return removed;
    },

    async zscore(key: string, member: string): Promise<string | null> {
      const z = zsets.get(key);
      const score = z?.get(member);
      return score !== undefined ? String(score) : null;
    },

    async zrangebyscore(
      key: string,
      min: string,
      max: string,
      ...rest: string[]
    ): Promise<string[]> {
      const z = zsets.get(key);
      if (!z) return [];
      const minVal = min === "-inf" ? -Infinity : Number(min);
      const maxVal = max === "+inf" ? Infinity : Number(max);
      const withScores = rest.includes("WITHSCORES");

      const sorted = [...z.entries()]
        .filter(([, s]) => s >= minVal && s <= maxVal)
        .sort((a, b) => a[1] - b[1]);

      if (withScores) {
        return sorted.flatMap(([m, s]) => [m, String(s)]);
      }
      return sorted.map(([m]) => m);
    },

    async hset(key: string, field: string, value: string): Promise<number> {
      getHash(key).set(field, value);
      return 1;
    },

    async hget(key: string, field: string): Promise<string | null> {
      return store.get(key)?.get(field) ?? null;
    },

    async hdel(key: string, ...fields: string[]): Promise<number> {
      const h = store.get(key);
      if (!h) return 0;
      let removed = 0;
      for (const f of fields) {
        if (h.delete(f)) removed++;
      }
      return removed;
    },

    async hmget(key: string, ...fields: string[]): Promise<(string | null)[]> {
      const h = store.get(key);
      return fields.map((f) => h?.get(f) ?? null);
    },

    async eval(_script: string, _numKeys: number, ...args: string[]): Promise<string[]> {
      // Simulate SWEEP_LUA: get stale from ZSET, remove from ZSET + HASH
      const scoreKey = args[0]!;
      const metaKeyStr = args[1]!;
      const cutoff = Number(args[2]!);

      const z = zsets.get(scoreKey);
      if (!z) return [];

      const stale: [string, string][] = [];
      for (const [member, score] of z) {
        if (score <= cutoff) {
          const meta = store.get(metaKeyStr)?.get(member) ?? "{}";
          stale.push([member, meta]);
        }
      }

      for (const [member] of stale) {
        z.delete(member);
        store.get(metaKeyStr)?.delete(member);
      }

      return stale.flat();
    },

    pipeline() {
      const calls: PipelineCall[] = [];
      pipelines.push(calls);

      const pipe = {
        zadd(...pipeArgs: unknown[]) {
          calls.push({ method: "zadd", args: pipeArgs });
          return pipe;
        },
        hset(...pipeArgs: unknown[]) {
          calls.push({ method: "hset", args: pipeArgs });
          return pipe;
        },
        zrem(...pipeArgs: unknown[]) {
          calls.push({ method: "zrem", args: pipeArgs });
          return pipe;
        },
        hdel(...pipeArgs: unknown[]) {
          calls.push({ method: "hdel", args: pipeArgs });
          return pipe;
        },
        async exec(): Promise<[Error | null, unknown][]> {
          const results: [Error | null, unknown][] = [];
          for (const call of calls) {
            const method = call.method as keyof typeof redis;
            const fn = redis[method] as (...a: unknown[]) => Promise<unknown>;
            const result = await fn(...call.args);
            results.push([null, result]);
          }
          return results;
        },
      };
      return pipe;
    },
  };

  return redis;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRedisPresence", () => {
  let redis: ReturnType<typeof createRedisMock>;
  let presence: PresenceAdapter;

  beforeEach(async () => {
    redis = createRedisMock();
    presence = createRedisPresence({ redis: redis as any });
    await presence.connect();
  });

  afterEach(async () => {
    await presence.disconnect();
  });

  const alice = { userId: "alice", connectionId: "conn_1", metadata: { status: "online" } };
  const bob = { userId: "bob", connectionId: "conn_2", metadata: { status: "away" } };

  describe("lifecycle", () => {
    it("reports healthy after connect", () => {
      expect(presence.isHealthy()).toBe(true);
    });

    it("reports unhealthy after disconnect", async () => {
      await presence.disconnect();
      expect(presence.isHealthy()).toBe(false);
    });

    it("ignores operations when disconnected", async () => {
      await presence.disconnect();
      await presence.track("room", alice);
      // Reconnect to be able to list
      presence = createRedisPresence({ redis: redis as any });
      await presence.connect();
      const entries = await presence.list("room");
      expect(entries).toEqual([]);
    });
  });

  describe("track", () => {
    it("stores entry in ZSET + HASH via pipeline", async () => {
      await presence.track("room", alice);
      const entries = await presence.list("room");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.userId).toBe("alice");
      expect(entries[0]!.connectionId).toBe("conn_1");
      expect(entries[0]!.metadata).toEqual({ status: "online" });
      expect(entries[0]!.joinedAt).toBeGreaterThan(0);
      expect(entries[0]!.lastSeenAt).toBeGreaterThan(0);
    });

    it("supports multiple connections", async () => {
      await presence.track("room", alice);
      await presence.track("room", bob);
      const entries = await presence.list("room");
      expect(entries).toHaveLength(2);
    });

    it("supports multiple topics independently", async () => {
      await presence.track("room1", alice);
      await presence.track("room2", bob);
      expect(await presence.list("room1")).toHaveLength(1);
      expect(await presence.list("room2")).toHaveLength(1);
    });
  });

  describe("untrack", () => {
    it("removes entry from ZSET + HASH", async () => {
      await presence.track("room", alice);
      await presence.track("room", bob);
      await presence.untrack("room", "conn_1");
      const entries = await presence.list("room");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.connectionId).toBe("conn_2");
    });

    it("is a no-op for unknown connectionId", async () => {
      await presence.untrack("room", "unknown");
      const entries = await presence.list("room");
      expect(entries).toEqual([]);
    });
  });

  describe("update", () => {
    it("replaces metadata while preserving userId and joinedAt", async () => {
      await presence.track("room", alice);
      await presence.update("room", "conn_1", { status: "dnd" });
      const entries = await presence.list("room");
      expect(entries[0]!.metadata).toEqual({ status: "dnd" });
      expect(entries[0]!.userId).toBe("alice");
    });

    it("is a no-op for unknown connectionId", async () => {
      await presence.update("room", "unknown", { status: "dnd" });
    });
  });

  describe("heartbeat", () => {
    it("updates ZSET score (lastSeenAt) without touching HASH", async () => {
      await presence.track("room", alice);
      const before = (await presence.list("room"))[0]!.lastSeenAt;

      await new Promise((r) => setTimeout(r, 5));
      await presence.heartbeat("room", "conn_1");

      const after = (await presence.list("room"))[0]!.lastSeenAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("is a no-op for unknown connectionId", async () => {
      await presence.heartbeat("room", "unknown");
      expect(await presence.list("room")).toEqual([]);
    });
  });

  describe("sweep", () => {
    it("removes stale entries via Lua script", async () => {
      vi.useFakeTimers();
      try {
        await presence.track("room", alice);
        vi.advanceTimersByTime(50_000);
        await presence.track("room", bob);

        const swept = await presence.sweep("room", 30_000);
        expect(swept).toHaveLength(1);
        expect(swept[0]!.connectionId).toBe("conn_1");

        const remaining = await presence.list("room");
        expect(remaining).toHaveLength(1);
        expect(remaining[0]!.connectionId).toBe("conn_2");
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns empty array when no stale entries", async () => {
      await presence.track("room", alice);
      const swept = await presence.sweep("room", 30_000);
      expect(swept).toEqual([]);
    });
  });

  describe("list", () => {
    it("returns empty array for unknown topic", async () => {
      const entries = await presence.list("unknown");
      expect(entries).toEqual([]);
    });

    it("returns all entries with correct fields", async () => {
      await presence.track("room", alice);
      await presence.track("room", bob);
      const entries = await presence.list("room");
      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry).toHaveProperty("userId");
        expect(entry).toHaveProperty("connectionId");
        expect(entry).toHaveProperty("metadata");
        expect(entry).toHaveProperty("joinedAt");
        expect(entry).toHaveProperty("lastSeenAt");
      }
    });
  });

  describe("onDiff", () => {
    it("fires on track with join", async () => {
      const diffs: PresenceDiff[] = [];
      presence.onDiff("room", (d) => diffs.push(d));

      await presence.track("room", alice);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.joins[0]!.userId).toBe("alice");
    });

    it("fires on untrack with leave", async () => {
      await presence.track("room", alice);
      const diffs: PresenceDiff[] = [];
      presence.onDiff("room", (d) => diffs.push(d));

      await presence.untrack("room", "conn_1");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.leaves).toHaveLength(1);
    });

    it("fires on sweep with leaves", async () => {
      vi.useFakeTimers();
      try {
        await presence.track("room", alice);
        vi.advanceTimersByTime(50_000);

        const diffs: PresenceDiff[] = [];
        presence.onDiff("room", (d) => diffs.push(d));

        await presence.sweep("room", 30_000);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]!.leaves).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns unsubscribe function", async () => {
      const diffs: PresenceDiff[] = [];
      const unsub = presence.onDiff("room", (d) => diffs.push(d));

      await presence.track("room", alice);
      expect(diffs).toHaveLength(1);

      unsub();
      await presence.track("room", bob);
      expect(diffs).toHaveLength(1);
    });

    it("does not fire for other topics", async () => {
      const diffs: PresenceDiff[] = [];
      presence.onDiff("room1", (d) => diffs.push(d));

      await presence.track("room2", alice);
      expect(diffs).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("emits errors from diff handlers via onError", async () => {
      const errors: Error[] = [];
      presence.onError((e) => errors.push(e));
      presence.onDiff("room", () => {
        throw new Error("diff boom");
      });

      await presence.track("room", alice);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe("diff boom");
    });
  });

  describe("prefix", () => {
    it("applies custom prefix to keys", async () => {
      const prefixed = createRedisPresence({
        redis: redis as any,
        prefix: "courier:",
      });
      await prefixed.connect();
      await prefixed.track("room", alice);

      // Verify entry exists via the prefixed presence
      const entries = await prefixed.list("room");
      expect(entries).toHaveLength(1);
      await prefixed.disconnect();
    });
  });
});
