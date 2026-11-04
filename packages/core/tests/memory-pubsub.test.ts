/**
 * The in-process pub/sub adapters: a bus several handlers of one process
 * share, as replicas share Redis, and the adapter of a server that runs
 * alone. Both keep the contract a handler relies on: ready from the start,
 * stopped for good by `disconnect()`.
 */
import { describe, expect, it, vi } from "vitest";

import type { AdapterState } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { createMemoryPubSub } from "../src/realtime/memory-pubsub";

describe("createMemoryBus", () => {
  it("brings what one replica publishes to every other replica subscribed, and not to itself", async () => {
    const bus = createMemoryBus();
    const a = bus.replica("a");
    const b = bus.replica("b");
    const c = bus.replica("c");
    const heard = { a: [] as unknown[], b: [] as unknown[], c: [] as unknown[] };
    await a.subscribe("room", (message) => heard.a.push(message));
    await b.subscribe("room", (message) => heard.b.push(message));
    await c.subscribe("other", (message) => heard.c.push(message));

    await a.publish("room", { text: "hi" });

    await expect.poll(() => heard.b).toEqual([{ text: "hi" }]);
    expect(heard.a).toEqual([]);
    expect(heard.c).toEqual([]);
  });

  it("delivers after the call that published returns, in the order published", async () => {
    const bus = createMemoryBus();
    const a = bus.replica("a");
    const heard: unknown[] = [];
    await bus.replica("b").subscribe("room", (message) => heard.push(message));

    void a.publish("room", 1);
    void a.publish("room", 2);
    expect(heard).toEqual([]);

    await expect.poll(() => heard).toEqual([1, 2]);
  });

  it("delivers to every handler of a channel, and a handler leaving keeps the others", async () => {
    const bus = createMemoryBus();
    const b = bus.replica("b");
    const first: unknown[] = [];
    const second: unknown[] = [];
    const leave = await b.subscribe("room", (message) => first.push(message));
    await b.subscribe("room", (message) => second.push(message));

    leave();
    await bus.replica("a").publish("room", "after");

    await expect.poll(() => second).toEqual(["after"]);
    expect(first).toEqual([]);
  });

  it("reports a handler that throws to the replica's error handlers, and goes on delivering", async () => {
    const bus = createMemoryBus();
    const b = bus.replica("b");
    const errors: Error[] = [];
    const heard: unknown[] = [];
    b.onError((error) => errors.push(error));
    await b.subscribe("room", () => {
      throw new Error("handler broke");
    });
    await b.subscribe("room", (message) => heard.push(message));

    await bus.replica("a").publish("room", "x");

    await expect.poll(() => heard).toEqual(["x"]);
    expect(errors.map((error) => error.message)).toEqual(["handler broke"]);
  });

  it("counts what a replica published and delivered", async () => {
    const bus = createMemoryBus();
    const a = bus.replica("a");
    const b = bus.replica("b");
    await b.subscribe("room", () => undefined);

    await a.publish("room", "x");

    await expect.poll(() => b.stats().delivered).toBe(1);
    expect(a.stats()).toMatchObject({ state: "ready", published: 1, dropped: 0 });
    expect(b.stats().channels).toEqual({ wanted: 1, confirmed: 1 });
  });

  it("is ready from the start, and stopped for good by disconnect()", async () => {
    const a = createMemoryBus().replica("a");
    const states: AdapterState[] = [];
    a.onStateChange((state) => states.push(state));
    expect(a.state).toBe("ready");
    expect(a.isHealthy()).toBe(true);
    await a.connect();

    await a.disconnect();
    await a.disconnect();

    expect(states).toEqual(["stopped"]);
    expect(a.isHealthy()).toBe(false);
    await expect(a.publish("room", "x")).rejects.toThrow(/stopped/);
    await expect(a.subscribe("room", () => undefined)).rejects.toThrow(/stopped/);
    await expect(a.connect()).rejects.toThrow(/stopped/);
  });

  it("stops hearing the bus once it is stopped", async () => {
    const bus = createMemoryBus();
    const b = bus.replica("b");
    const handler = vi.fn();
    await b.subscribe("room", handler);

    await b.disconnect();
    await bus.replica("a").publish("room", "x");

    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
    expect(b.stats().channels).toEqual({ wanted: 0, confirmed: 0 });
  });
});

describe("createMemoryPubSub", () => {
  it("is a replica alone on its own bus: nothing it publishes comes back", async () => {
    const pubsub = createMemoryPubSub("solo");
    const heard: unknown[] = [];
    await pubsub.subscribe("room", (message) => heard.push(message));

    await pubsub.publish("room", "x");
    await Promise.resolve();

    expect(heard).toEqual([]);
    expect(pubsub.state).toBe("ready");
  });

  it("does not share a bus with another adapter made the same way", async () => {
    const heard: unknown[] = [];
    await createMemoryPubSub("b").subscribe("room", (message) => heard.push(message));

    await createMemoryPubSub("a").publish("room", "x");
    await Promise.resolve();

    expect(heard).toEqual([]);
  });
});
