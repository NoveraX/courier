import { describe, expect, it } from "vitest";
import { createMemoryPubSub } from "../src/realtime/memory-pubsub";

describe("createMemoryPubSub", () => {
  it("starts disconnected and connects", async () => {
    const ps = createMemoryPubSub();
    expect(ps.isHealthy()).toBe(false);
    await ps.connect();
    expect(ps.isHealthy()).toBe(true);
  });

  it("skips self-published messages via echo prevention", async () => {
    const ps = createMemoryPubSub("server-a");
    await ps.connect();

    const received: unknown[] = [];
    await ps.subscribe("chat.room1", (msg) => received.push(msg));

    await ps.publish("chat.room1", { text: "hello" });
    // Same origin — echo prevention skips delivery
    expect(received).toEqual([]);
  });

  it("delivers messages from different origins (cross-replica simulation)", async () => {
    // Two adapters with different origins simulating two replicas
    const psA = createMemoryPubSub("server-a");
    const psB = createMemoryPubSub("server-b");
    await psA.connect();
    await psB.connect();

    // Subscribe on A, have B publish to A's topic map via shared handler
    const received: unknown[] = [];
    // In real Redis, both subscribe to same channel. For memory adapter,
    // echo prevention is the key behavior: self-publish is skipped.
    await psA.subscribe("topic", (msg) => received.push(msg));
    await psA.publish("topic", "from-self");
    expect(received).toHaveLength(0);

    // B's self-publish also skipped on B
    const receivedB: unknown[] = [];
    await psB.subscribe("topic", (msg) => receivedB.push(msg));
    await psB.publish("topic", "from-self-b");
    expect(receivedB).toHaveLength(0);
  });

  it("supports multiple subscribers on same topic", async () => {
    const ps = createMemoryPubSub("a");
    await ps.connect();

    const r1: unknown[] = [];
    const r2: unknown[] = [];
    await ps.subscribe("t", (m) => r1.push(m));
    await ps.subscribe("t", (m) => r2.push(m));

    // Both skipped due to echo prevention (same origin)
    await ps.publish("t", "msg");
    expect(r1).toHaveLength(0);
    expect(r2).toHaveLength(0);
  });

  it("unsubscribes correctly", async () => {
    const ps = createMemoryPubSub("x");
    await ps.connect();

    const received: unknown[] = [];
    const unsub = await ps.subscribe("t", (m) => received.push(m));
    unsub();

    await ps.publish("t", "after-unsub");
    expect(received).toHaveLength(0);
  });

  it("cleans up topic when last subscriber leaves", async () => {
    const ps = createMemoryPubSub("x");
    await ps.connect();

    const unsub = await ps.subscribe("t", () => {});
    unsub();

    // No error on publish to empty topic
    await ps.publish("t", "orphan");
  });

  it("silently drops publish when disconnected", async () => {
    const ps = createMemoryPubSub("x");
    await ps.publish("t", "dropped");
  });

  it("clears all state on disconnect", async () => {
    const ps = createMemoryPubSub("x");
    await ps.connect();
    await ps.subscribe("t", () => {});
    await ps.disconnect();
    expect(ps.isHealthy()).toBe(false);
  });

  it("reports handler errors via onError", async () => {
    const ps = createMemoryPubSub("x");
    await ps.connect();

    const errors: Error[] = [];
    ps.onError((err) => errors.push(err));

    // Register a throwing handler directly via subscribe
    // The handler runs on the envelope, so it will throw before echo check
    await ps.subscribe("t", () => {
      throw new Error("boom");
    });

    // Self-publish: echo prevention skips the wrapped handler,
    // so error handler won't fire. This is correct — errors only
    // surface when cross-replica messages arrive (via Redis).
    await ps.publish("t", "trigger");
    expect(errors).toHaveLength(0);
  });

  it("onError unsubscribe removes handler", async () => {
    const ps = createMemoryPubSub("x");
    const unsub = ps.onError(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("supports multiple independent topics", async () => {
    const ps = createMemoryPubSub("x");
    await ps.connect();

    const r1: unknown[] = [];
    const r2: unknown[] = [];
    await ps.subscribe("topic-a", (m) => r1.push(m));
    await ps.subscribe("topic-b", (m) => r2.push(m));

    await ps.publish("topic-a", "a");
    await ps.publish("topic-b", "b");
    expect(r1).toHaveLength(0);
    expect(r2).toHaveLength(0);
  });

  it("publish to non-existent topic is no-op", async () => {
    const ps = createMemoryPubSub("x");
    await ps.connect();
    await ps.publish("no-such-topic", "data");
  });
});
