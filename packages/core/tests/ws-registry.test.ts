import { describe, expect, it, vi } from "vitest";

import { createConnectionRegistry } from "../src/adapter/ws-registry";
import { createServerTopicManager } from "../src/adapter/ws-topics";

function createEntry(id: string, meta: Record<string, unknown> = {}) {
  return {
    connectionId: id,
    meta,
    connectedAt: Date.now(),
    sendRaw: vi.fn(),
    sendEncoded: vi.fn(),
    close: vi.fn(),
  };
}

describe("createConnectionRegistry", () => {
  it("starts empty", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    expect(registry.count).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it("adds and retrieves connections", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const entry = createEntry("conn-1", { userId: "u1" });

    registry.add(entry);

    expect(registry.count).toBe(1);
    expect(registry.has("conn-1")).toBe(true);
    expect(registry.has("conn-2")).toBe(false);

    const info = registry.get("conn-1");
    expect(info).toBeDefined();
    expect(info!.connectionId).toBe("conn-1");
    expect(info!.meta).toEqual({ userId: "u1" });
    expect(info!.topicCount).toBe(0);
  });

  it("returns undefined for unknown connection", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("lists all connections", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);

    registry.add(createEntry("c1"));
    registry.add(createEntry("c2"));
    registry.add(createEntry("c3"));

    const list = registry.list();
    expect(list).toHaveLength(3);
    expect(list.map((c) => c.connectionId).sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("removes connections", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);

    registry.add(createEntry("c1"));
    registry.add(createEntry("c2"));
    expect(registry.count).toBe(2);

    registry.remove("c1");
    expect(registry.count).toBe(1);
    expect(registry.has("c1")).toBe(false);
    expect(registry.has("c2")).toBe(true);
  });

  it("remove is idempotent for unknown IDs", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    registry.remove("nonexistent");
    expect(registry.count).toBe(0);
  });

  it("filters connections by metadata", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);

    registry.add(createEntry("c1", { role: "admin" }));
    registry.add(createEntry("c2", { role: "user" }));
    registry.add(createEntry("c3", { role: "admin" }));

    const admins = registry.getByMeta((m) => m.role === "admin");
    expect(admins).toHaveLength(2);
    expect(admins.map((c) => c.connectionId).sort()).toEqual(["c1", "c3"]);
  });

  it("sends data to a specific connection", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const entry = createEntry("c1");

    registry.add(entry);
    registry.send("c1", { hello: "world" });

    expect(entry.sendRaw).toHaveBeenCalledWith(
      expect.objectContaining({ type: "data", payload: { hello: "world" } }),
    );
  });

  it("send is no-op for unknown connection", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    // Should not throw
    registry.send("unknown", { data: 1 });
  });

  it("broadcast snapshots entries — mid-flight removal still delivers to snapshotted targets", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    // 600 entries → broadcast yields after BATCH_SIZE=512, then continues with snapshot
    const allEntries = Array.from({ length: 600 }, (_, i) => createEntry(`c${i}`));
    for (const e of allEntries) registry.add(e);

    // First entry's sendEncoded removes a late-id entry from the registry
    // before the yieldTick — without snapshot, the late entry would be skipped
    const lateEntry = allEntries[599]!;
    (allEntries[0]!.sendEncoded as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      registry.remove("c599");
    });

    await registry.broadcast("hello");

    // Snapshot semantics: even though c599 was removed mid-broadcast, it must
    // still receive the message because the snapshot was taken upfront.
    expect(lateEntry.sendEncoded).toHaveBeenCalledOnce();
  });

  it("broadcasts to all connections via sendEncoded (single encode)", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const e1 = createEntry("c1");
    const e2 = createEntry("c2");
    const e3 = createEntry("c3");

    registry.add(e1);
    registry.add(e2);
    registry.add(e3);

    await registry.broadcast("hello");

    // broadcast uses sendEncoded (pre-serialized JSON string)
    expect(e1.sendEncoded).toHaveBeenCalledOnce();
    expect(e2.sendEncoded).toHaveBeenCalledOnce();
    expect(e3.sendEncoded).toHaveBeenCalledOnce();
    const encoded = e1.sendEncoded.mock.calls[0]![0] as string;
    const parsed = JSON.parse(encoded);
    expect(parsed).toMatchObject({ type: "data", payload: "hello" });
  });

  it("broadcasts with exclude", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const e1 = createEntry("c1");
    const e2 = createEntry("c2");

    registry.add(e1);
    registry.add(e2);

    await registry.broadcast("msg", "c1");

    expect(e1.sendEncoded).not.toHaveBeenCalled();
    expect(e2.sendEncoded).toHaveBeenCalledOnce();
    const parsed = JSON.parse(e2.sendEncoded.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ type: "data", payload: "msg" });
  });

  it("broadcasts to topic subscribers only via sendEncoded", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const e1 = createEntry("c1");
    const e2 = createEntry("c2");
    const e3 = createEntry("c3");

    registry.add(e1);
    registry.add(e2);
    registry.add(e3);

    tm.subscribe("c1", { topic: "chat.messages", cleanup: vi.fn() });
    tm.subscribe("c3", { topic: "chat.messages", cleanup: vi.fn() });

    await registry.broadcastToTopic("chat.messages", { text: "hi" });

    expect(e1.sendEncoded).toHaveBeenCalledOnce();
    expect(e2.sendEncoded).not.toHaveBeenCalled();
    expect(e3.sendEncoded).toHaveBeenCalledOnce();
    const parsed = JSON.parse(e1.sendEncoded.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ type: "data", topic: "chat.messages", payload: { text: "hi" } });
  });

  it("broadcastToTopic with exclude", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const e1 = createEntry("c1");
    const e2 = createEntry("c2");

    registry.add(e1);
    registry.add(e2);

    tm.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    tm.subscribe("c2", { topic: "room", cleanup: vi.fn() });

    await registry.broadcastToTopic("room", "data", "c1");

    expect(e1.sendEncoded).not.toHaveBeenCalled();
    expect(e2.sendEncoded).toHaveBeenCalled();
  });

  it("disconnects a connection", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const entry = createEntry("c1");

    registry.add(entry);
    registry.disconnect("c1");

    expect(entry.close).toHaveBeenCalledWith(1000, "Disconnected by server");
  });

  it("disconnects with custom code and reason", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const entry = createEntry("c1");

    registry.add(entry);
    registry.disconnect("c1", 4001, "Banned");

    expect(entry.close).toHaveBeenCalledWith(4001, "Banned");
  });

  it("disconnect is no-op for unknown connection", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    // Should not throw
    registry.disconnect("unknown");
  });

  it("reflects topicCount from topicManager", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);

    registry.add(createEntry("c1"));

    tm.subscribe("c1", { topic: "a", cleanup: vi.fn() });
    tm.subscribe("c1", { topic: "b", cleanup: vi.fn() });
    tm.subscribe("c1", { topic: "c", cleanup: vi.fn() });

    const info = registry.get("c1");
    expect(info!.topicCount).toBe(3);
  });

  it("broadcastToBaseTopic delivers to all qualified topics via sendEncoded", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const e1 = createEntry("c1");
    const e2 = createEntry("c2");
    const e3 = createEntry("c3");

    registry.add(e1);
    registry.add(e2);
    registry.add(e3);

    tm.subscribe("c1", { topic: "chat.room#aaa", cleanup: vi.fn() });
    tm.subscribe("c2", { topic: "chat.room#bbb", cleanup: vi.fn() });
    tm.subscribe("c3", { topic: "other.topic", cleanup: vi.fn() });

    await registry.broadcastToBaseTopic("chat.room", "hello");

    expect(e1.sendEncoded).toHaveBeenCalledOnce();
    expect(e2.sendEncoded).toHaveBeenCalledOnce();
    expect(e3.sendEncoded).not.toHaveBeenCalled();
    const p1 = JSON.parse(e1.sendEncoded.mock.calls[0]![0] as string);
    const p2 = JSON.parse(e2.sendEncoded.mock.calls[0]![0] as string);
    expect(p1).toMatchObject({ type: "data", topic: "chat.room#aaa", payload: "hello" });
    expect(p2).toMatchObject({ type: "data", topic: "chat.room#bbb", payload: "hello" });
  });

  it("broadcastToBaseTopic with exclude skips excluded connection", async () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const e1 = createEntry("c1");
    const e2 = createEntry("c2");

    registry.add(e1);
    registry.add(e2);

    tm.subscribe("c1", { topic: "room#x", cleanup: vi.fn() });
    tm.subscribe("c2", { topic: "room#x", cleanup: vi.fn() });

    await registry.broadcastToBaseTopic("room", "data", "c1");

    expect(e1.sendEncoded).not.toHaveBeenCalled();
    expect(e2.sendEncoded).toHaveBeenCalled();
  });

  it("sendToConnection sends data with topic context", () => {
    const tm = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(tm);
    const entry = createEntry("c1");

    registry.add(entry);
    registry.sendToConnection("c1", "notifications", { alert: true });

    expect(entry.sendRaw).toHaveBeenCalledWith(
      expect.objectContaining({ type: "data", topic: "notifications", payload: { alert: true } }),
    );
  });

  it("sendToConnection is no-op for unknown connection", () => {
    const registry = createConnectionRegistry();
    // Should not throw
    registry.sendToConnection("unknown", "topic", "data");
  });
});
