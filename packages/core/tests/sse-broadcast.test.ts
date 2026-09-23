import { describe, expect, it, vi } from "vitest";
import { createSSEConnectionRegistry } from "../src/adapter/sse-registry";
import type { SSERegistryEntry } from "../src/adapter/sse-registry";

function createEntry(overrides?: Partial<SSERegistryEntry>): SSERegistryEntry {
  return {
    connectionId: crypto.randomUUID(),
    connectedAt: Date.now(),
    meta: {},
    source: "api",
    group: "chat",
    method: "feed",
    eventCount: 0,
    totalBytes: 0,
    lastEventAt: 0,
    abort: vi.fn(),
    send: vi.fn(() => true),
    ...overrides,
  };
}

describe("SSE Broadcast", () => {
  describe("send", () => {
    it("sends event to a specific connection", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      const ok = registry.send(entry.connectionId, { data: "hello" });
      expect(ok).toBe(true);
      /* The stream numbers and encodes it, so the ids stay in one sequence. */
      expect(entry.send).toHaveBeenCalledWith({ data: "hello" }, true);
    });

    it("returns false for unknown connection", () => {
      const registry = createSSEConnectionRegistry();
      expect(registry.send("nonexistent", { data: "test" })).toBe(false);
    });

    it("returns false when the stream refuses the event", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry({ send: vi.fn(() => false) });
      registry.add(entry);

      expect(registry.send(entry.connectionId, { data: "test" })).toBe(false);
    });

    it("hands the stream the event as given, custom id included", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      const event = { event: "update", data: { x: 1 }, id: "custom-42" };
      registry.send(entry.connectionId, event);

      expect(entry.send).toHaveBeenCalledWith(event, true);
    });
  });

  describe("broadcastToEndpoint", () => {
    it("sends to all connections matching endpoint", () => {
      const registry = createSSEConnectionRegistry();
      const a = createEntry({ source: "api", group: "chat", method: "feed" });
      const b = createEntry({ source: "api", group: "chat", method: "feed" });
      const c = createEntry({ source: "api", group: "users", method: "stream" });
      registry.add(a);
      registry.add(b);
      registry.add(c);

      const result = registry.broadcastToEndpoint("api", { data: "msg" }, "chat", "feed");
      expect(result.size).toBe(2);
      expect(result.get(a.connectionId)).toBe(true);
      expect(result.get(b.connectionId)).toBe(true);
      expect(c.send).not.toHaveBeenCalled();
    });

    it("broadcasts to all when only source specified", () => {
      const registry = createSSEConnectionRegistry();
      const a = createEntry({ source: "api", group: "chat" });
      const b = createEntry({ source: "api", group: "users" });
      const c = createEntry({ source: "other" });
      registry.add(a);
      registry.add(b);
      registry.add(c);

      const result = registry.broadcastToEndpoint("api", { data: "msg" });
      expect(result.size).toBe(2);
      expect(c.send).not.toHaveBeenCalled();
    });

    it("returns empty map when no matches", () => {
      const registry = createSSEConnectionRegistry();
      registry.add(createEntry({ source: "api" }));

      const result = registry.broadcastToEndpoint("other", { data: "msg" });
      expect(result.size).toBe(0);
    });

    it("tracks failed deliveries in result", () => {
      const registry = createSSEConnectionRegistry();
      const ok = createEntry({ send: vi.fn(() => true) });
      const fail = createEntry({ send: vi.fn(() => false) });
      registry.add(ok);
      registry.add(fail);

      const result = registry.broadcastAll({ data: "test" });
      expect(result.get(ok.connectionId)).toBe(true);
      expect(result.get(fail.connectionId)).toBe(false);
    });
  });

  describe("broadcastToMeta", () => {
    it("sends to connections matching metadata predicate", () => {
      const registry = createSSEConnectionRegistry();
      const admin = createEntry({ meta: { role: "admin" } });
      const user = createEntry({ meta: { role: "user" } });
      registry.add(admin);
      registry.add(user);

      const result = registry.broadcastToMeta(
        (m) => m.role === "admin",
        { data: "admin-only" },
      );
      expect(result.size).toBe(1);
      expect(result.get(admin.connectionId)).toBe(true);
      expect(user.send).not.toHaveBeenCalled();
    });
  });

  describe("broadcastAll", () => {
    it("sends to every active connection", () => {
      const registry = createSSEConnectionRegistry();
      const entries = Array.from({ length: 5 }, () => createEntry());
      for (const e of entries) registry.add(e);

      const result = registry.broadcastAll({ data: "global" });
      expect(result.size).toBe(5);
      for (const e of entries) {
        expect(e.send).toHaveBeenCalledOnce();
      }
    });

    it("returns empty map on empty registry", () => {
      const registry = createSSEConnectionRegistry();
      const result = registry.broadcastAll({ data: "empty" });
      expect(result.size).toBe(0);
    });
  });
});
