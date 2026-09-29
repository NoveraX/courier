import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalSSERegistry, SSERegistryEntry } from "../src/adapter/sse-registry";
import { createSSEConnectionRegistry } from "../src/adapter/sse-registry";

function createEntry(overrides?: Partial<SSERegistryEntry>): SSERegistryEntry {
  return {
    connectionId: crypto.randomUUID(),
    connectedAt: Date.now(),
    meta: {},
    source: "api",
    group: "users",
    method: "stream",
    eventCount: 0,
    totalBytes: 0,
    lastEventAt: 0,
    abort: vi.fn(),
    send: vi.fn(() => true),
    notify: vi.fn(() => true),
    ...overrides,
  };
}

describe("SSEConnectionRegistry", () => {
  let registry: InternalSSERegistry;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("add / remove / count", () => {
    it("starts empty", () => {
      registry = createSSEConnectionRegistry();
      expect(registry.count).toBe(0);
      expect(registry.list()).toEqual([]);
    });

    it("adds and tracks a connection", () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry();
      expect(registry.add(entry)).toBe(true);
      expect(registry.count).toBe(1);
      expect(registry.has(entry.connectionId)).toBe(true);
    });

    it("removes a connection", () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);
      registry.remove(entry.connectionId);
      expect(registry.count).toBe(0);
      expect(registry.has(entry.connectionId)).toBe(false);
    });

    it("remove is idempotent", () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);
      registry.remove(entry.connectionId);
      registry.remove(entry.connectionId);
      expect(registry.count).toBe(0);
    });
  });

  describe("get / list", () => {
    it("returns connection info by ID", () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry({ meta: { userId: "42" } });
      registry.add(entry);

      const info = registry.get(entry.connectionId);
      expect(info).toMatchObject({
        connectionId: entry.connectionId,
        source: "api",
        group: "users",
        method: "stream",
        meta: { userId: "42" },
        eventCount: 0,
        totalBytes: 0,
      });
    });

    it("returns undefined for unknown ID", () => {
      registry = createSSEConnectionRegistry();
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("lists all connections", () => {
      registry = createSSEConnectionRegistry();
      const a = createEntry();
      const b = createEntry();
      registry.add(a);
      registry.add(b);
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe("getByMeta", () => {
    it("filters connections by metadata predicate", () => {
      registry = createSSEConnectionRegistry();
      registry.add(createEntry({ meta: { role: "admin" } }));
      registry.add(createEntry({ meta: { role: "user" } }));
      registry.add(createEntry({ meta: { role: "admin" } }));

      const admins = registry.getByMeta((m) => m.role === "admin");
      expect(admins).toHaveLength(2);
    });
  });

  describe("getByEndpoint", () => {
    it("filters by source only", () => {
      registry = createSSEConnectionRegistry();
      registry.add(createEntry({ source: "api" }));
      registry.add(createEntry({ source: "other" }));

      expect(registry.getByEndpoint("api")).toHaveLength(1);
    });

    it("filters by source + group", () => {
      registry = createSSEConnectionRegistry();
      registry.add(createEntry({ source: "api", group: "users" }));
      registry.add(createEntry({ source: "api", group: "orders" }));

      expect(registry.getByEndpoint("api", "users")).toHaveLength(1);
    });

    it("filters by source + group + method", () => {
      registry = createSSEConnectionRegistry();
      registry.add(createEntry({ source: "api", group: "users", method: "stream" }));
      registry.add(createEntry({ source: "api", group: "users", method: "feed" }));

      expect(registry.getByEndpoint("api", "users", "stream")).toHaveLength(1);
    });

    it("handles undefined group", () => {
      registry = createSSEConnectionRegistry();
      registry.add(createEntry({ source: "api", group: undefined }));

      expect(registry.getByEndpoint("api")).toHaveLength(1);
    });
  });

  describe("disconnect / disconnectAll", () => {
    it("disconnect calls abort on the entry", () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);
      registry.disconnect(entry.connectionId);
      expect(entry.abort).toHaveBeenCalledOnce();
    });

    it("disconnect is safe for unknown ID", () => {
      registry = createSSEConnectionRegistry();
      expect(() => registry.disconnect("nonexistent")).not.toThrow();
    });

    it("disconnectAll aborts all entries", () => {
      registry = createSSEConnectionRegistry();
      const a = createEntry();
      const b = createEntry();
      registry.add(a);
      registry.add(b);
      registry.disconnectAll();
      expect(a.abort).toHaveBeenCalledOnce();
      expect(b.abort).toHaveBeenCalledOnce();
    });
  });

  describe("recordEvent", () => {
    it("increments eventCount and totalBytes", () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      registry.recordEvent(entry.connectionId, 100);
      registry.recordEvent(entry.connectionId, 200);

      const info = registry.get(entry.connectionId)!;
      expect(info.eventCount).toBe(2);
      expect(info.totalBytes).toBe(300);
      expect(info.lastEventAt).toBeGreaterThan(0);
    });

    it("is safe for unknown ID", () => {
      registry = createSSEConnectionRegistry();
      expect(() => registry.recordEvent("nonexistent", 100)).not.toThrow();
    });
  });

  describe("shutdown", () => {
    it("sets isShuttingDown flag", async () => {
      registry = createSSEConnectionRegistry();
      expect(registry.isShuttingDown).toBe(false);
      await registry.shutdown({ drainMs: 10 });
      expect(registry.isShuttingDown).toBe(true);
    });

    it("rejects new connections during shutdown", async () => {
      registry = createSSEConnectionRegistry();
      await registry.shutdown({ drainMs: 10 });

      const entry = createEntry();
      expect(registry.add(entry)).toBe(false);
      expect(entry.abort).toHaveBeenCalledOnce();
    });

    it("tells every active connection when to come back", async () => {
      registry = createSSEConnectionRegistry();
      const a = createEntry();
      const b = createEntry();
      registry.add(a);
      registry.add(b);

      await registry.shutdown({ retryMs: 5000, drainMs: 10 });

      const notice = "event: courier:shutdown\nretry: 5000\ndata: null\n\n";
      /* A control event, not one of the endpoint's, and unnumbered. */
      expect(a.notify).toHaveBeenCalledWith(notice);
      expect(b.notify).toHaveBeenCalledWith(notice);
      expect(a.send).not.toHaveBeenCalled();
    });

    it("aborts the shutdown signal", async () => {
      registry = createSSEConnectionRegistry();
      const signal = registry.shutdownSignal;
      expect(signal.aborted).toBe(false);

      await registry.shutdown({ drainMs: 10 });
      expect(signal.aborted).toBe(true);
    });

    it("is idempotent", async () => {
      registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      await registry.shutdown({ drainMs: 10 });
      await registry.shutdown({ drainMs: 10 });

      expect(entry.notify).toHaveBeenCalledTimes(1);
    });

    it("clears all entries after drain", async () => {
      registry = createSSEConnectionRegistry();
      registry.add(createEntry());
      registry.add(createEntry());

      await registry.shutdown({ drainMs: 10 });
      expect(registry.count).toBe(0);
    });
  });
});
