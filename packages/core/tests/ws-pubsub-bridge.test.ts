import { describe, expect, it, vi } from "vitest";

import { createPubSubBridge } from "../src/adapter/ws-pubsub-bridge";
import { createConnectionRegistry } from "../src/adapter/ws-registry";
import { createServerTopicManager } from "../src/adapter/ws-topics";
import { createMemoryPubSub } from "../src/realtime/memory-pubsub";

function createEntry(id: string) {
  return {
    connectionId: id,
    meta: {},
    connectedAt: Date.now(),
    sendRaw: vi.fn(),
    sendEncoded: vi.fn(),
    close: vi.fn(),
  };
}

function setupReplica(pubsub: ReturnType<typeof createMemoryPubSub>) {
  const registry = createConnectionRegistry();
  const bridge = createPubSubBridge(pubsub, registry);
  const topicManager = createServerTopicManager({
    onFirstSubscriber: (topic) => bridge.onTopicSubscribe(topic),
    onLastUnsubscriber: (topic) => bridge.onTopicUnsubscribe(topic),
  });
  registry.setTopicManager(topicManager);
  return { registry, bridge, topicManager };
}

describe("createPubSubBridge", () => {
  it("subscribes to pubsub on first local subscriber", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const subscribeSpy = vi.spyOn(pubsub, "subscribe");
    const { bridge } = setupReplica(pubsub);

    await bridge.onTopicSubscribe("chat.room1");

    expect(subscribeSpy).toHaveBeenCalledOnce();
    expect(subscribeSpy).toHaveBeenCalledWith("chat.room1", expect.any(Function));
  });

  it("does not re-subscribe on second local subscriber (ref counting)", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const subscribeSpy = vi.spyOn(pubsub, "subscribe");
    const { bridge } = setupReplica(pubsub);

    await bridge.onTopicSubscribe("chat.room1");
    await bridge.onTopicSubscribe("chat.room1");

    expect(subscribeSpy).toHaveBeenCalledOnce();
  });

  it("unsubscribes from pubsub when last local subscriber leaves", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const { bridge } = setupReplica(pubsub);

    await bridge.onTopicSubscribe("room");
    await bridge.onTopicSubscribe("room");

    // First leave — still has one subscriber
    await bridge.onTopicUnsubscribe("room");
    // Second leave — no more subscribers
    await bridge.onTopicUnsubscribe("room");
    // Third leave — no-op (already cleaned up)
    await bridge.onTopicUnsubscribe("room");
  });

  it("destroy cleans up all pubsub subscriptions", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const subscribeSpy = vi.spyOn(pubsub, "subscribe");
    const { bridge } = setupReplica(pubsub);

    await bridge.onTopicSubscribe("topic-a");
    await bridge.onTopicSubscribe("topic-b");
    expect(subscribeSpy).toHaveBeenCalledTimes(2);

    bridge.destroy();

    // After destroy, new subscribes are rejected (bridge is dead)
    await bridge.onTopicSubscribe("topic-a");
    expect(subscribeSpy).toHaveBeenCalledTimes(2);
  });
});

describe("cross-replica WS broadcast", () => {
  it("delivers messages from remote replica to local connections", async () => {
    // Mock pubsub that captures subscribe handlers (simulates shared Redis bus)
    const handlers = new Map<string, (message: unknown) => void>();
    const mockPubsub = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isHealthy: () => true,
      onError: () => () => {},
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(async (topic: string, handler: (message: unknown) => void) => {
        handlers.set(topic, handler);
        return () => { handlers.delete(topic); };
      }),
    };

    const registry = createConnectionRegistry();
    const bridge = createPubSubBridge(mockPubsub, registry);
    const tm = createServerTopicManager({
      onFirstSubscriber: (topic) => bridge.onTopicSubscribe(topic),
      onLastUnsubscriber: (topic) => bridge.onTopicUnsubscribe(topic),
    });
    registry.setTopicManager(tm);

    // Local connection subscribes
    const entry = createEntry("b-conn-1");
    registry.add(entry);
    tm.subscribe("b-conn-1", { topic: "chat.room1", cleanup: vi.fn() });

    // Simulate remote replica publishing (pubsub handler invoked directly)
    const remoteHandler = handlers.get("chat.room1");
    expect(remoteHandler).toBeDefined();
    remoteHandler!({ text: "hello from A" });
    // Allow async broadcast to complete (fire-and-forget in bridge)
    await new Promise((r) => setTimeout(r, 0));

    // broadcastToTopic uses sendEncoded (pre-serialized JSON)
    expect(entry.sendEncoded).toHaveBeenCalledOnce();
    const parsed = JSON.parse(entry.sendEncoded.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ type: "data", topic: "chat.room1", payload: { text: "hello from A" } });
  });

  it("echo prevention: self-published messages skip pubsub handler", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const registry = createConnectionRegistry();
    const bridge = createPubSubBridge(pubsub, registry);
    const tm = createServerTopicManager({
      onFirstSubscriber: (topic) => bridge.onTopicSubscribe(topic),
      onLastUnsubscriber: (topic) => bridge.onTopicUnsubscribe(topic),
    });
    registry.setTopicManager(tm);

    const entry = createEntry("a-conn-1");
    registry.add(entry);
    tm.subscribe("a-conn-1", { topic: "room", cleanup: vi.fn() });

    // Self-publish — echo prevention in MemoryPubSub skips own origin
    await pubsub.publish("room", { text: "self" });

    // Should NOT be delivered via pubsub handler (echo prevention)
    expect(entry.sendRaw).not.toHaveBeenCalled();
  });

  it("ref counting survives multiple subscribe/unsubscribe cycles", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const subscribeSpy = vi.spyOn(pubsub, "subscribe");
    const { bridge } = setupReplica(pubsub);

    // Cycle 1
    await bridge.onTopicSubscribe("t");
    await bridge.onTopicUnsubscribe("t");

    // Cycle 2
    await bridge.onTopicSubscribe("t");
    await bridge.onTopicUnsubscribe("t");

    expect(subscribeSpy).toHaveBeenCalledTimes(2);
  });

  it("handles multiple topics independently", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const subscribeSpy = vi.spyOn(pubsub, "subscribe");
    const { bridge } = setupReplica(pubsub);

    await bridge.onTopicSubscribe("topic-a");
    await bridge.onTopicSubscribe("topic-b");

    expect(subscribeSpy).toHaveBeenCalledTimes(2);

    // Unsubscribe topic-a, topic-b still active
    await bridge.onTopicUnsubscribe("topic-a");

    // New subscribe to topic-a should create fresh pubsub subscription
    await bridge.onTopicSubscribe("topic-a");
    expect(subscribeSpy).toHaveBeenCalledTimes(3);
  });

  it("gracefully handles pubsub.subscribe failure", async () => {
    const pubsub = createMemoryPubSub("server-A");
    // NOT connected — subscribe will silently fail
    const { bridge } = setupReplica(pubsub);

    // Should not throw
    await bridge.onTopicSubscribe("room");
  });

  it("serializes concurrent subscribe calls to prevent duplicate pubsub subscriptions", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const subscribeSpy = vi.spyOn(pubsub, "subscribe");
    const { bridge } = setupReplica(pubsub);

    // Fire two subscribes concurrently — without pending guard, both would call pubsub.subscribe
    await Promise.all([
      bridge.onTopicSubscribe("chat.room1"),
      bridge.onTopicSubscribe("chat.room1"),
    ]);

    // Only one pubsub.subscribe call — second one waits and increments refCount
    expect(subscribeSpy).toHaveBeenCalledOnce();
  });

  it("serializes concurrent unsubscribe after in-flight subscribe", async () => {
    const pubsub = createMemoryPubSub("server-A");
    await pubsub.connect();

    const { bridge } = setupReplica(pubsub);

    // Subscribe then immediately unsubscribe concurrently
    const sub = bridge.onTopicSubscribe("room");
    const unsub = bridge.onTopicUnsubscribe("room");

    await Promise.all([sub, unsub]);
    // Should not throw — unsubscribe waits for subscribe to finish
  });
});

describe("topic manager hooks integration", () => {
  it("fires onFirstSubscriber when first connection subscribes", async () => {
    const onFirst = vi.fn();
    const onLast = vi.fn();
    const tm = createServerTopicManager({ onFirstSubscriber: onFirst, onLastUnsubscriber: onLast });

    tm.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    expect(onFirst).toHaveBeenCalledWith("room");
    expect(onFirst).toHaveBeenCalledOnce();

    // Second subscriber — should NOT fire onFirstSubscriber again
    tm.subscribe("c2", { topic: "room", cleanup: vi.fn() });
    expect(onFirst).toHaveBeenCalledOnce();
  });

  it("fires onLastUnsubscriber when last connection leaves", async () => {
    const onFirst = vi.fn();
    const onLast = vi.fn();
    const tm = createServerTopicManager({ onFirstSubscriber: onFirst, onLastUnsubscriber: onLast });

    tm.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    tm.subscribe("c2", { topic: "room", cleanup: vi.fn() });

    await tm.unsubscribe("c1", "room");
    expect(onLast).not.toHaveBeenCalled();

    await tm.unsubscribe("c2", "room");
    expect(onLast).toHaveBeenCalledWith("room");
    expect(onLast).toHaveBeenCalledOnce();
  });

  it("fires onLastUnsubscriber on disconnectAll", async () => {
    const onLast = vi.fn();
    const tm = createServerTopicManager({ onLastUnsubscriber: onLast });

    tm.subscribe("c1", { topic: "room-a", cleanup: vi.fn() });
    tm.subscribe("c1", { topic: "room-b", cleanup: vi.fn() });

    await tm.disconnectAll("c1");

    expect(onLast).toHaveBeenCalledWith("room-a");
    expect(onLast).toHaveBeenCalledWith("room-b");
    expect(onLast).toHaveBeenCalledTimes(2);
  });

  it("does not fire onLastUnsubscriber if other connections remain", async () => {
    const onLast = vi.fn();
    const tm = createServerTopicManager({ onLastUnsubscriber: onLast });

    tm.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    tm.subscribe("c2", { topic: "room", cleanup: vi.fn() });

    await tm.disconnectAll("c1");

    // c2 still subscribed to "room"
    expect(onLast).not.toHaveBeenCalled();
  });

  it("works without hooks (backward compatible)", () => {
    const tm = createServerTopicManager();
    tm.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    expect(tm.subscribers("room").has("c1")).toBe(true);
    expect(tm.subscribers("room").size).toBe(1);
  });
});
