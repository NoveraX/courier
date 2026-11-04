/**
 * The Redis pub/sub adapter against stand-ins for its two ioredis clients,
 * whose status and events a test sets: what it does before Redis is ready,
 * when Redis comes and goes, when it refuses a SUBSCRIBE, and what it says
 * of it. The suite against a real Redis is redis-pubsub-outage.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRedisPubSub } from "../src/redis-pubsub";
import type { RedisPubSubConfig } from "../src/types";

type Listener = (...args: unknown[]) => void;

function createClient(status = "ready") {
  const listeners = new Map<string, Set<Listener>>();
  const client = {
    status,
    publish: vi.fn(async (_channel: string, _payload: string) => 1),
    subscribe: vi.fn(async (..._channels: string[]) => 1),
    unsubscribe: vi.fn(async (..._channels: string[]) => 0),
    connect: vi.fn(async () => undefined),
    on(event: string, listener: Listener) {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
      return client;
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return client;
    },
    /** Take a status and say so, as ioredis does. */
    become(next: string) {
      client.status = next;
      client.emit(next);
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
    },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
  return client;
}

type Client = ReturnType<typeof createClient>;

function adapterOn(publisher: Client, subscriber: Client, more: Partial<RedisPubSubConfig> = {}) {
  return createRedisPubSub({
    publisher: publisher as unknown as RedisPubSubConfig["publisher"],
    subscriber: subscriber as unknown as RedisPubSubConfig["subscriber"],
    origin: "here",
    ...more,
  });
}

const fromAnother = (payload: unknown) =>
  JSON.stringify({ origin: "elsewhere", payload, timestamp: 1 });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createRedisPubSub", () => {
  it("delivers to a subscription made before connect(), from the moment it is made", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    const heard: unknown[] = [];

    await pubsub.subscribe("room", (message) => heard.push(message));
    await expect.poll(() => sub.subscribe.mock.calls).toEqual([["room"]]);
    sub.emit("message", "room", fromAnother("hi"));

    expect(heard).toEqual(["hi"]);
  });

  it("subscribes, once Redis is ready, what it was asked for while Redis was away", async () => {
    const sub = createClient("connecting");
    const pubsub = adapterOn(createClient("connecting"), sub);

    await pubsub.subscribe("a", () => undefined);
    await pubsub.subscribe("b", () => undefined);
    await Promise.resolve();
    expect(sub.subscribe).not.toHaveBeenCalled();
    sub.become("ready");

    await expect.poll(() => sub.subscribe.mock.calls).toEqual([["a", "b"]]);
    await expect.poll(() => pubsub.stats().channels).toEqual({ wanted: 2, confirmed: 2 });
  });

  it("makes every subscription again after a reconnect", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    await pubsub.subscribe("a", () => undefined);
    await expect.poll(() => pubsub.stats().channels.confirmed).toBe(1);

    sub.become("close");
    expect(pubsub.stats().channels.confirmed).toBe(0);
    sub.become("ready");

    await expect.poll(() => sub.subscribe.mock.calls).toEqual([["a"], ["a"]]);
    await expect.poll(() => pubsub.stats().channels.confirmed).toBe(1);
  });

  it("tries a SUBSCRIBE Redis refused again, after a pause that grows, until it is taken", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const sub = createClient();
    sub.subscribe
      .mockRejectedValueOnce(new Error("NOPERM no permissions"))
      .mockRejectedValueOnce(new Error("NOPERM no permissions"));
    const pubsub = adapterOn(createClient(), sub);
    const errors: string[] = [];
    pubsub.onError((error) => errors.push(error.message));

    await pubsub.subscribe("room", () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(sub.subscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(246);
    expect(sub.subscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(sub.subscribe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(496);

    expect(sub.subscribe).toHaveBeenCalledTimes(3);
    expect(errors).toEqual(["NOPERM no permissions", "NOPERM no permissions"]);
    expect(pubsub.stats().channels.confirmed).toBe(1);
  });

  it("lets go of a channel no handler wants any more, and keeps one another handler still wants", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    const leaveFirst = await pubsub.subscribe("room", () => undefined);
    const leaveSecond = await pubsub.subscribe("room", () => undefined);
    await expect.poll(() => pubsub.stats().channels.confirmed).toBe(1);

    leaveFirst();
    await Promise.resolve();
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    leaveSecond();

    await expect.poll(() => sub.unsubscribe.mock.calls).toEqual([["room"]]);
    await expect.poll(() => pubsub.stats().channels).toEqual({ wanted: 0, confirmed: 0 });
  });

  it("queues what is published while Redis is away, and sends it in order once it is back", async () => {
    const pub = createClient("reconnecting");
    const pubsub = adapterOn(pub, createClient(), { prefix: "app:" });

    for (const message of ["one", "two", "three"]) await pubsub.publish("room", message);
    expect(pub.publish).not.toHaveBeenCalled();
    expect(pubsub.stats().queued.messages).toBe(3);
    pub.become("ready");

    expect(
      pub.publish.mock.calls.map(([channel, payload]) => [channel, JSON.parse(payload).payload]),
    ).toEqual([
      ["app:room", "one"],
      ["app:room", "two"],
      ["app:room", "three"],
    ]);
    await expect
      .poll(() => pubsub.stats())
      .toMatchObject({ published: 3, dropped: 0, queued: { messages: 0, bytes: 0 } });
  });

  it("drops the oldest it holds past its count or bytes, and what waited too long, counting each", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pub = createClient("connecting");
    const pubsub = adapterOn(pub, createClient(), {
      queue: { maxMessages: 2, maxBytes: 1_000, maxAgeMs: 1_000 },
    });

    for (const message of [1, 2, 3]) await pubsub.publish("room", message);
    expect(pubsub.stats()).toMatchObject({ dropped: 1, queued: { messages: 2 } });
    await pubsub.publish("room", "x".repeat(2_000));
    expect(pubsub.stats().dropped).toBe(2);
    vi.advanceTimersByTime(1_001);
    pub.become("ready");

    expect(pub.publish).not.toHaveBeenCalled();
    expect(pubsub.stats()).toMatchObject({ dropped: 4, queued: { messages: 0 } });
  });

  it("refuses queue bounds it cannot keep", () => {
    expect(() => adapterOn(createClient(), createClient(), { queue: { maxMessages: 0 } })).toThrow(
      /queue: \{ maxMessages \} \}\) takes a number of at least 1, not 0/,
    );
  });

  it("never rejects a publish because Redis is away, and counts one Redis failed", async () => {
    const pub = createClient();
    pub.publish.mockRejectedValueOnce(new Error("Connection is closed."));
    const pubsub = adapterOn(pub, createClient());
    const errors: string[] = [];
    pubsub.onError((error) => errors.push(error.message));

    await expect(pubsub.publish("room", "lost")).resolves.toBeUndefined();

    expect(errors).toEqual(["Connection is closed."]);
    expect(pubsub.stats().dropped).toBe(1);
  });

  it("is connecting, ready, degraded and ready again as its two connections are", () => {
    const pub = createClient("connecting");
    const sub = createClient("connecting");
    const pubsub = adapterOn(pub, sub);
    const states: string[] = [pubsub.state];
    pubsub.onStateChange((state) => states.push(state));

    pub.become("ready");
    sub.become("ready");
    sub.become("close");
    sub.become("reconnecting");
    sub.become("ready");

    expect(states).toEqual(["connecting", "ready", "degraded", "ready"]);
    expect(pubsub.isHealthy()).toBe(true);
  });

  it("resolves connect() once both connections are ready, and fails it at its deadline", async () => {
    const pub = createClient("connecting");
    const pubsub = adapterOn(pub, createClient());

    await expect(pubsub.connect({ timeoutMs: 20 })).rejects.toThrow(
      "Redis was not ready within 20 ms; the adapter goes on connecting",
    );
    const connecting = pubsub.connect({ timeoutMs: 1_000 });
    pub.become("ready");

    await expect(connecting).resolves.toBeUndefined();
  });

  it("settles disconnect() within its deadline though Redis never answers UNSUBSCRIBE", async () => {
    const sub = createClient();
    sub.unsubscribe.mockReturnValue(new Promise<number>(() => undefined));
    const pubsub = adapterOn(createClient(), sub);
    await pubsub.subscribe("room", () => undefined);
    await expect.poll(() => pubsub.stats().channels.confirmed).toBe(1);

    const started = Date.now();
    await pubsub.disconnect({ timeoutMs: 50 });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(pubsub.state).toBe("stopped");
    await expect(pubsub.publish("room", "late")).rejects.toThrow(/stopped/);
  });

  it("leaves no listener on the clients once disconnected", async () => {
    const pub = createClient();
    const sub = createClient();
    const pubsub = adapterOn(pub, sub);

    await pubsub.disconnect();

    expect([pub.listenerCount(), sub.listenerCount()]).toEqual([0, 0]);
  });

  it("delivers only to its own channels, so a subscriber connection two adapters share mixes nothing up", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    const errors: Error[] = [];
    pubsub.onError((error) => errors.push(error));

    sub.emit("message", "presence:diff:room", JSON.stringify({ origin: "x", topic: "room" }));

    expect(errors).toEqual([]);
  });

  it("skips its own messages, and reports one on its channel that is no envelope", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    const heard: unknown[] = [];
    const errors: string[] = [];
    pubsub.onError((error) => errors.push(error.message));
    await pubsub.subscribe("room", (message) => heard.push(message));

    sub.emit("message", "room", JSON.stringify({ origin: "here", payload: "own", timestamp: 1 }));
    sub.emit("message", "room", "not-json{{");
    sub.emit("message", "room", JSON.stringify("hello"));

    expect(heard).toEqual([]);
    expect(errors).toEqual([
      'Not a Courier message on channel "room"',
      'Not a Courier message on channel "room"',
    ]);
  });

  it("reports a handler that throws, and still delivers to the others", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    const heard: unknown[] = [];
    const errors: string[] = [];
    pubsub.onError((error) => errors.push(error.message));
    await pubsub.subscribe("room", () => {
      throw new Error("handler broke");
    });
    await pubsub.subscribe("room", (message) => heard.push(message));

    sub.emit("message", "room", fromAnother("x"));

    expect(heard).toEqual(["x"]);
    expect(errors).toEqual(["handler broke"]);
  });

  it("logs, on one line, an error nobody listens for", () => {
    vi.stubEnv("NO_COLOR", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sub = createClient();
    adapterOn(createClient(), sub);

    sub.emit(
      "error",
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" }),
    );

    expect(warn.mock.calls.map((call) => String(call[1]))).toEqual([
      expect.stringMatching(
        /redis error code=ECONNREFUSED reason="Error: connect ECONNREFUSED 127\.0\.0\.1:1"$/,
      ),
    ]);
    vi.unstubAllEnvs();
  });

  it("connects a client made with lazyConnect, which would otherwise wait for a command", () => {
    const pub = createClient("wait");
    const sub = createClient("wait");

    adapterOn(pub, sub);

    expect([pub.connect, sub.connect].map((connect) => connect.mock.calls.length)).toEqual([1, 1]);
  });
});
