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
    enqueue: vi.fn(() => true),
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
      expect(entry.enqueue).toHaveBeenCalledOnce();

      const chunk = vi.mocked(entry.enqueue).mock.calls[0]![0];
      const text = new TextDecoder().decode(chunk);
      expect(text).toContain("data: hello");
      expect(text).toContain("id: 1");
    });

    it("returns false for unknown connection", () => {
      const registry = createSSEConnectionRegistry();
      expect(registry.send("nonexistent", { data: "test" })).toBe(false);
    });

    it("returns false when enqueue fails", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry({ enqueue: vi.fn(() => false) });
      registry.add(entry);

      expect(registry.send(entry.connectionId, { data: "test" })).toBe(false);
    });

    it("formats event with custom event type and id", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      registry.send(entry.connectionId, { event: "update", data: { x: 1 }, id: "custom-42" });

      const chunk = vi.mocked(entry.enqueue).mock.calls[0]![0];
      const text = new TextDecoder().decode(chunk);
      expect(text).toContain("event: update");
      expect(text).toContain("id: custom-42");
      expect(text).toContain('"x":1');
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
      expect(c.enqueue).not.toHaveBeenCalled();
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
      expect(c.enqueue).not.toHaveBeenCalled();
    });

    it("returns empty map when no matches", () => {
      const registry = createSSEConnectionRegistry();
      registry.add(createEntry({ source: "api" }));

      const result = registry.broadcastToEndpoint("other", { data: "msg" });
      expect(result.size).toBe(0);
    });

    it("tracks failed deliveries in result", () => {
      const registry = createSSEConnectionRegistry();
      const ok = createEntry({ enqueue: vi.fn(() => true) });
      const fail = createEntry({ enqueue: vi.fn(() => false) });
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
      expect(user.enqueue).not.toHaveBeenCalled();
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
        expect(e.enqueue).toHaveBeenCalledOnce();
      }
    });

    it("returns empty map on empty registry", () => {
      const registry = createSSEConnectionRegistry();
      const result = registry.broadcastAll({ data: "empty" });
      expect(result.size).toBe(0);
    });
  });

  describe("broadcast sequence numbers", () => {
    it("assigns incrementing seq IDs across broadcasts", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      registry.send(entry.connectionId, { data: "first" });
      registry.send(entry.connectionId, { data: "second" });
      registry.broadcastAll({ data: "third" });

      const calls = vi.mocked(entry.enqueue).mock.calls;
      const texts = calls.map((c) => new TextDecoder().decode(c[0]));

      expect(texts[0]).toContain("id: 1");
      expect(texts[1]).toContain("id: 2");
      expect(texts[2]).toContain("id: 3");
    });

    it("custom id overrides seq", () => {
      const registry = createSSEConnectionRegistry();
      const entry = createEntry();
      registry.add(entry);

      registry.send(entry.connectionId, { data: "x", id: "custom" });

      const text = new TextDecoder().decode(vi.mocked(entry.enqueue).mock.calls[0]![0]);
      expect(text).toContain("id: custom");
    });
  });
});
