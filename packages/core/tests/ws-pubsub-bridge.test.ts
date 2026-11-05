/**
 * How a replica's handler holds its pub/sub subscriptions: one per channel
 * while a local connection needs it, the adapter keeping each one it was
 * given, and nothing waiting on the adapter — a subscription it has not
 * taken yet is let go of once it does, and stopping waits on none.
 */
import { format } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPubSubBridge } from "../src/adapter/ws-pubsub-bridge";
import { createConnectionRegistry } from "../src/adapter/ws-registry";
import { createServerTopicManager } from "../src/adapter/ws-topics";
import { createRefusalLog } from "../src/logger/refusal-log";
import type { PubSubAdapter } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";

function createEntry(id: string) {
  const sendEncoded = vi.fn();
  return {
    connectionId: id,
    meta: {},
    connectedAt: Date.now(),
    sendRaw: vi.fn(),
    sendEncoded,
    sendTopicEvent: (_topic: string, _position: unknown, encoded: string) => sendEncoded(encoded),
    close: vi.fn(),
    requireAuth: vi.fn(() => () => undefined),
    evict: vi.fn(),
  };
}

function replica(pubsub: PubSubAdapter) {
  const registry = createConnectionRegistry({ log: pubsub.log });
  const bridge = createPubSubBridge(pubsub, registry, createRefusalLog("WS"));
  const topics = createServerTopicManager({
    onFirstSubscriber: (topic) => bridge.onTopicSubscribe(topic),
    onLastUnsubscriber: (topic) => bridge.onTopicUnsubscribe(topic),
  });
  registry.setTopicManager(topics);
  return { registry, bridge, topics };
}

/** An adapter whose subscriptions settle when the test says, and that records what it let go of. */
function slowAdapter() {
  const bus = createMemoryBus().replica("slow");
  const settles: Array<() => void> = [];
  const letGo: string[] = [];
  const adapter: PubSubAdapter = {
    ...bus,
    get state() {
      return bus.state;
    },
    subscribe: (channel) =>
      new Promise<() => void>((resolve) => {
        settles.push(() => resolve(() => letGo.push(channel)));
      }),
  };
  return { adapter, settles, letGo };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPubSubBridge", () => {
  it("subscribes a topic and its endpoint's channel once, for its first local subscriber", () => {
    const pubsub = createMemoryBus().replica("a");
    const subscribe = vi.spyOn(pubsub, "subscribe");
    const { bridge } = replica(pubsub);

    bridge.onTopicSubscribe('api.chat.room#{"room":"a"}');
    bridge.onTopicSubscribe('api.chat.room#{"room":"a"}');

    expect(subscribe.mock.calls.map(([channel]) => channel)).toEqual([
      'api.chat.room#{"room":"a"}',
      "api.chat.room#*",
    ]);
  });

  it("unsubscribes once its last local subscriber leaves", async () => {
    const pubsub = createMemoryBus().replica("a");
    const { bridge } = replica(pubsub);
    bridge.onTopicSubscribe("api.chat.room");
    bridge.onTopicSubscribe("api.chat.room");
    await expect.poll(() => pubsub.stats().channels.wanted).toBe(2);

    bridge.onTopicUnsubscribe("api.chat.room");
    expect(pubsub.stats().channels.wanted).toBe(2);
    bridge.onTopicUnsubscribe("api.chat.room");
    bridge.onTopicUnsubscribe("api.chat.room");

    expect(pubsub.stats().channels.wanted).toBe(0);
  });

  it("lets go of every subscription when destroyed, and takes none after", async () => {
    const pubsub = createMemoryBus().replica("a");
    const { bridge } = replica(pubsub);
    bridge.onTopicSubscribe("api.chat.a");
    bridge.onTopicSubscribe("api.chat.b");
    bridge.onConnectionOpen();
    await expect.poll(() => pubsub.stats().channels.wanted).toBe(5);

    bridge.destroy();
    bridge.onTopicSubscribe("api.chat.a");

    expect(pubsub.stats().channels.wanted).toBe(0);
  });

  it("does not wait on a subscription the adapter has not taken yet, and lets go of it once it does", () => {
    const { adapter, settles, letGo } = slowAdapter();
    const { bridge } = replica(adapter);
    bridge.onTopicSubscribe("api.chat.a");

    bridge.destroy();
    for (const settle of settles) settle();

    return expect.poll(() => letGo.sort()).toEqual(["api.chat.a", "api.chat.a#*"]);
  });

  it("lets go of a channel released before the adapter took it", async () => {
    const { adapter, settles, letGo } = slowAdapter();
    const { bridge } = replica(adapter);
    bridge.onTopicSubscribe("api.chat.a");
    bridge.onTopicUnsubscribe("api.chat.a");

    for (const settle of settles) settle();

    await expect.poll(() => letGo.sort()).toEqual(["api.chat.a", "api.chat.a#*"]);
  });

  it("logs, as a fault, an adapter that would not take a subscription", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const pubsub = createMemoryBus().replica("a");
    await pubsub.disconnect();
    const { bridge } = replica(pubsub);

    bridge.onTopicSubscribe("api.chat.a");

    await expect
      .poll(() => error.mock.calls.map((call) => format(...call)).join("\n"))
      .toContain("The pub/sub adapter did not take channel api.chat.a");
  });

  it("logs a publish a stopped adapter refused on one line, and still delivers locally", async () => {
    vi.stubEnv("NO_COLOR", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pubsub = createMemoryBus().replica("a");
    const { bridge } = replica(pubsub);
    await pubsub.disconnect();

    await bridge.publishEvent("api.chat.a", { text: "late" });

    const said = warn.mock.calls.map((call) => format(...call));
    expect(said).toEqual([
      expect.stringMatching(/publish refused code=PUBSUB_STOPPED reason="Error: /),
    ]);
    vi.unstubAllEnvs();
  });
});

describe("a broadcast between two replicas on one bus", () => {
  it("reaches each replica's subscribers once: the sender's from it, the other's from the bus", async () => {
    const bus = createMemoryBus();
    const a = replica(bus.replica("a"));
    const b = replica(bus.replica("b"));
    const onA = createEntry("a-1");
    const onB = createEntry("b-1");
    a.registry.add(onA);
    b.registry.add(onB);
    a.topics.subscribe("a-1", { topic: "api.chat.room", cleanup: vi.fn() });
    b.topics.subscribe("b-1", { topic: "api.chat.room", cleanup: vi.fn() });

    await a.bridge.publishEvent("api.chat.room", { text: "from a" });

    await expect.poll(() => onB.sendEncoded.mock.calls.length).toBe(1);
    for (const entry of [onA, onB]) {
      expect(entry.sendEncoded).toHaveBeenCalledOnce();
      expect(JSON.parse(String(entry.sendEncoded.mock.calls[0]?.[0]))).toMatchObject({
        type: "data",
        topic: "api.chat.room",
        payload: { text: "from a" },
        seq: 1,
      });
    }
  });

  it("with a log, delivers no event the log did not number, and says so once", async () => {
    vi.stubEnv("NO_COLOR", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bus = createMemoryBus({ log: {} });
    const b = replica(bus.replica("b"));
    const onB = createEntry("b-1");
    b.registry.add(onB);
    b.topics.subscribe("b-1", { topic: "api.chat.room", cleanup: vi.fn() });

    await bus.replica("a").publish("api.chat.room", { text: "around the log" });
    await bus.replica("c").publish("api.chat.room", { text: "around it again" });

    await expect.poll(() => warn.mock.calls.length).toBe(1);
    expect(format(...(warn.mock.calls[0] ?? []))).toMatch(
      /event not delivered code=UNLOGGED endpoint=api\.chat\.room/,
    );
    expect(onB.sendEncoded).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("reaches every qualified topic of the endpoint on the other replica", async () => {
    const bus = createMemoryBus();
    const a = replica(bus.replica("a"));
    const b = replica(bus.replica("b"));
    const inRoomA = createEntry("b-1");
    const inRoomB = createEntry("b-2");
    b.registry.add(inRoomA);
    b.registry.add(inRoomB);
    b.topics.subscribe("b-1", { topic: 'api.chat.room#{"room":"a"}', cleanup: vi.fn() });
    b.topics.subscribe("b-2", { topic: 'api.chat.room#{"room":"b"}', cleanup: vi.fn() });

    await a.bridge.publishToBaseTopic("api.chat.room", "to every room");

    await expect
      .poll(() => [inRoomA, inRoomB].map((entry) => entry.sendEncoded.mock.calls.length))
      .toEqual([1, 1]);
  });
});

describe("topic manager hooks", () => {
  it("fires onFirstSubscriber for a topic's first connection only", () => {
    const onFirst = vi.fn();
    const topics = createServerTopicManager({ onFirstSubscriber: onFirst });

    topics.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    topics.subscribe("c2", { topic: "room", cleanup: vi.fn() });

    expect(onFirst.mock.calls).toEqual([["room"]]);
  });

  it("fires onLastUnsubscriber once its last connection has left", async () => {
    const onLast = vi.fn();
    const topics = createServerTopicManager({ onLastUnsubscriber: onLast });
    topics.subscribe("c1", { topic: "room", cleanup: vi.fn() });
    topics.subscribe("c2", { topic: "room", cleanup: vi.fn() });

    await topics.unsubscribe("c1", "room");
    expect(onLast).not.toHaveBeenCalled();
    await topics.unsubscribe("c2", "room");

    expect(onLast.mock.calls).toEqual([["room"]]);
  });

  it("fires onLastUnsubscriber for each topic a closing connection held alone", async () => {
    const onLast = vi.fn();
    const topics = createServerTopicManager({ onLastUnsubscriber: onLast });
    topics.subscribe("c1", { topic: "room-a", cleanup: vi.fn() });
    topics.subscribe("c1", { topic: "room-b", cleanup: vi.fn() });
    topics.subscribe("c2", { topic: "room-b", cleanup: vi.fn() });

    await topics.disconnectAll("c1");

    expect(onLast.mock.calls).toEqual([["room-a"]]);
  });
});
