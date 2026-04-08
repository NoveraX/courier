import { describe, expect, it, vi } from "vitest";

import { createServerTopicManager } from "../src/adapter/ws-topics";

describe("createServerTopicManager", () => {
  it("subscribes and tracks a topic", () => {
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "chat.messages", cleanup: vi.fn() });

    expect(manager.has("conn-1", "chat.messages")).toBe(true);
    expect(manager.size).toBe(1);
  });

  it("tracks multiple topics per connection", () => {
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "chat.messages", cleanup: vi.fn() });
    manager.subscribe("conn-1", { topic: "chat.typing", cleanup: vi.fn() });

    expect(manager.has("conn-1", "chat.messages")).toBe(true);
    expect(manager.has("conn-1", "chat.typing")).toBe(true);
    expect(manager.size).toBe(1);
  });

  it("tracks multiple connections", () => {
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "chat.messages", cleanup: vi.fn() });
    manager.subscribe("conn-2", { topic: "chat.messages", cleanup: vi.fn() });

    expect(manager.size).toBe(2);
  });

  it("unsubscribes and calls cleanup", async () => {
    const cleanup = vi.fn();
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "chat.messages", cleanup });

    await manager.unsubscribe("conn-1", "chat.messages");

    expect(cleanup).toHaveBeenCalledOnce();
    expect(manager.has("conn-1", "chat.messages")).toBe(false);
    expect(manager.size).toBe(0);
  });

  it("unsubscribe is safe for non-existent topic", async () => {
    const manager = createServerTopicManager();
    await expect(manager.unsubscribe("conn-1", "nonexistent")).resolves.toBeUndefined();
  });

  it("disconnectAll calls all cleanup handlers", async () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "t1", cleanup: cleanup1 });
    manager.subscribe("conn-1", { topic: "t2", cleanup: cleanup2 });

    await manager.disconnectAll("conn-1");

    expect(cleanup1).toHaveBeenCalledOnce();
    expect(cleanup2).toHaveBeenCalledOnce();
    expect(manager.size).toBe(0);
  });

  it("disconnectAll handles cleanup errors gracefully", async () => {
    const failCleanup = vi.fn().mockRejectedValue(new Error("cleanup failed"));
    const goodCleanup = vi.fn();
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "t1", cleanup: failCleanup });
    manager.subscribe("conn-1", { topic: "t2", cleanup: goodCleanup });

    // Should not throw — uses Promise.allSettled
    await expect(manager.disconnectAll("conn-1")).resolves.toBeUndefined();
    expect(failCleanup).toHaveBeenCalledOnce();
    expect(goodCleanup).toHaveBeenCalledOnce();
  });

  it("disconnectAll is safe for non-existent connection", async () => {
    const manager = createServerTopicManager();
    await expect(manager.disconnectAll("nonexistent")).resolves.toBeUndefined();
  });

  it("subscribers returns all connections for a topic as ReadonlySet", () => {
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "chat.messages", cleanup: vi.fn() });
    manager.subscribe("conn-2", { topic: "chat.messages", cleanup: vi.fn() });
    manager.subscribe("conn-3", { topic: "other.topic", cleanup: vi.fn() });

    const subs = manager.subscribers("chat.messages");
    expect(subs.size).toBe(2);
    expect(subs.has("conn-1")).toBe(true);
    expect(subs.has("conn-2")).toBe(true);
  });

  it("subscribers returns empty set for unknown topic", () => {
    const manager = createServerTopicManager();
    expect(manager.subscribers("nonexistent").size).toBe(0);
  });

  it("removes connection map entry when last topic is unsubscribed", async () => {
    const manager = createServerTopicManager();
    manager.subscribe("conn-1", { topic: "t1", cleanup: vi.fn() });

    await manager.unsubscribe("conn-1", "t1");
    expect(manager.size).toBe(0);
  });

  it("allTopics returns all active topic names", () => {
    const manager = createServerTopicManager();
    manager.subscribe("c1", { topic: "room#aaa", cleanup: vi.fn() });
    manager.subscribe("c2", { topic: "room#bbb", cleanup: vi.fn() });
    manager.subscribe("c1", { topic: "chat", cleanup: vi.fn() });

    const topics = manager.allTopics();
    expect(topics).toHaveLength(3);
    expect(topics).toContain("room#aaa");
    expect(topics).toContain("room#bbb");
    expect(topics).toContain("chat");
  });

  it("allTopics returns empty array when no subscriptions", () => {
    const manager = createServerTopicManager();
    expect(manager.allTopics()).toEqual([]);
  });

  it("allTopics removes topic after last subscriber leaves", async () => {
    const manager = createServerTopicManager();
    manager.subscribe("c1", { topic: "room", cleanup: vi.fn() });

    expect(manager.allTopics()).toContain("room");

    await manager.unsubscribe("c1", "room");
    expect(manager.allTopics()).not.toContain("room");
  });
});
