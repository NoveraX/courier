import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PresenceAdapter, PresenceDiff } from "../src/realtime/adapters";
import { createMemoryPresence } from "../src/realtime/memory-presence";

describe("createMemoryPresence", () => {
  let presence: PresenceAdapter;

  beforeEach(async () => {
    presence = createMemoryPresence({ sweepIntervalMs: 0 });
    await presence.connect();
  });

  afterEach(async () => {
    await presence.disconnect();
  });

  const alice = { userId: "alice", connectionId: "conn_1", metadata: { status: "online" } };
  const bob = { userId: "bob", connectionId: "conn_2", metadata: { status: "away" } };
  const aliceTab2 = { userId: "alice", connectionId: "conn_3", metadata: { status: "idle" } };

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
      const entries = await presence.list("room");
      expect(entries).toEqual([]);
    });
  });

  describe("track", () => {
    it("adds an entry and assigns joinedAt/lastSeenAt", async () => {
      await presence.track("room", alice);
      const entries = await presence.list("room");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.userId).toBe("alice");
      expect(entries[0]!.connectionId).toBe("conn_1");
      expect(entries[0]!.metadata).toEqual({ status: "online" });
      expect(entries[0]!.joinedAt).toBeGreaterThan(0);
      expect(entries[0]!.lastSeenAt).toBe(entries[0]!.joinedAt);
    });

    it("supports multiple connections for the same user (multi-tab)", async () => {
      await presence.track("room", alice);
      await presence.track("room", aliceTab2);
      const entries = await presence.list("room");
      expect(entries).toHaveLength(2);
      const connIds = entries.map((e) => e.connectionId).sort();
      expect(connIds).toEqual(["conn_1", "conn_3"]);
    });

    it("supports multiple topics independently", async () => {
      await presence.track("room1", alice);
      await presence.track("room2", bob);
      expect(await presence.list("room1")).toHaveLength(1);
      expect(await presence.list("room2")).toHaveLength(1);
    });
  });

  describe("untrack", () => {
    it("removes an entry by connectionId", async () => {
      await presence.track("room", alice);
      await presence.track("room", bob);
      await presence.untrack("room", "conn_1");
      const entries = await presence.list("room");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.connectionId).toBe("conn_2");
    });

    it("is a no-op for unknown connectionId", async () => {
      await presence.untrack("room", "unknown");
      expect(await presence.list("room")).toEqual([]);
    });

    it("cleans up empty topic", async () => {
      await presence.track("room", alice);
      await presence.untrack("room", "conn_1");
      expect(await presence.list("room")).toEqual([]);
    });
  });

  describe("update", () => {
    it("replaces metadata for existing connection", async () => {
      await presence.track("room", alice);
      await presence.update("room", "conn_1", { status: "dnd" });
      const entries = await presence.list("room");
      expect(entries[0]!.metadata).toEqual({ status: "dnd" });
    });

    it("refreshes lastSeenAt on update", async () => {
      await presence.track("room", alice);
      const before = (await presence.list("room"))[0]!.lastSeenAt;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 5));
      await presence.update("room", "conn_1", { status: "dnd" });

      const after = (await presence.list("room"))[0]!.lastSeenAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("is a no-op for unknown connectionId", async () => {
      await presence.update("room", "unknown", { status: "dnd" });
      expect(await presence.list("room")).toEqual([]);
    });
  });

  describe("heartbeat", () => {
    it("updates lastSeenAt without changing metadata", async () => {
      await presence.track("room", alice);
      const initial = (await presence.list("room"))[0]!;

      await new Promise((r) => setTimeout(r, 5));
      await presence.heartbeat("room", "conn_1");

      const updated = (await presence.list("room"))[0]!;
      expect(updated.lastSeenAt).toBeGreaterThanOrEqual(initial.lastSeenAt);
      expect(updated.metadata).toEqual(initial.metadata);
      expect(updated.joinedAt).toBe(initial.joinedAt);
    });

    it("is a no-op for unknown connectionId", async () => {
      await presence.heartbeat("room", "unknown");
      expect(await presence.list("room")).toEqual([]);
    });
  });

  describe("sweep", () => {
    it("removes entries older than threshold", async () => {
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

    it("returns empty array for unknown topic", async () => {
      const swept = await presence.sweep("unknown", 30_000);
      expect(swept).toEqual([]);
    });
  });

  describe("onDiff", () => {
    it("fires on track with join", async () => {
      const diffs: PresenceDiff[] = [];
      presence.onDiff("room", (d) => diffs.push(d));

      await presence.track("room", alice);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.joins).toHaveLength(1);
      expect(diffs[0]!.joins[0]!.userId).toBe("alice");
      expect(diffs[0]!.leaves).toEqual([]);
    });

    it("fires on untrack with leave", async () => {
      await presence.track("room", alice);
      const diffs: PresenceDiff[] = [];
      presence.onDiff("room", (d) => diffs.push(d));

      await presence.untrack("room", "conn_1");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.leaves).toHaveLength(1);
      expect(diffs[0]!.leaves[0]!.connectionId).toBe("conn_1");
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
      expect(diffs).toHaveLength(1); // no new diff after unsub
    });

    it("does not fire for other topics", async () => {
      const diffs: PresenceDiff[] = [];
      presence.onDiff("room1", (d) => diffs.push(d));

      await presence.track("room2", alice);
      expect(diffs).toEqual([]);
    });
  });

  describe("auto-sweep timer", () => {
    it("sweeps stale entries on interval", async () => {
      vi.useFakeTimers();
      try {
        const timedPresence = createMemoryPresence({
          sweepIntervalMs: 100,
          staleThresholdMs: 50,
        });
        await timedPresence.connect();

        await timedPresence.track("room", alice);
        vi.advanceTimersByTime(60);

        // Trigger sweep timer
        vi.advanceTimersByTime(100);

        const entries = await timedPresence.list("room");
        expect(entries).toEqual([]);

        await timedPresence.disconnect();
      } finally {
        vi.useRealTimers();
      }
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

  describe("list", () => {
    it("returns empty array for unknown topic", async () => {
      expect(await presence.list("unknown")).toEqual([]);
    });
  });
});
