/**
 * The Redis pub/sub adapter against stand-ins for its two ioredis clients,
 * whose status and events a test sets: what it does before Redis is ready,
 * when Redis comes and goes, when it refuses a SUBSCRIBE, and what it says
 * of it; that a subscription settles once Redis has answered for it; and
 * that it lets go of every channel its connection may hold and no handler
 * wants, however late Redis answered. The suite against a real Redis is
 * redis-pubsub-outage.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { SUBSCRIBE_TIMEOUT_MS } from "../src/adapter-deadlines";
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
    ...more,
  });
}

/* What an adapter sent through its publisher, as Redis would deliver it back: channel and message. */
function sentBy(publisher: Client): [string, string] {
  const [call] = publisher.publish.mock.calls;
  if (call === undefined) throw new Error("Nothing was published");
  return call;
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

  it("settles subscribe() once Redis has answered its SUBSCRIBE, and at its deadline at the latest", async () => {
    vi.useFakeTimers();
    const sub = createClient();
    const answer = Promise.withResolvers<number>();
    sub.subscribe
      .mockImplementationOnce(() => answer.promise)
      .mockImplementationOnce(() => new Promise<number>(() => undefined));
    const pubsub = adapterOn(createClient(), sub);
    const settled: string[] = [];
    const subscribe = (channel: string) =>
      void pubsub.subscribe(channel, () => undefined).then(() => settled.push(channel));

    subscribe("room");
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS - 1);
    expect(settled).toEqual([]);
    answer.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual(["room"]);

    subscribe("lobby");
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS - 1);
    expect(settled).toEqual(["room"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual(["room", "lobby"]);
    expect(sub.subscribe.mock.calls).toEqual([["room"], ["lobby"]]);
  });

  it("settles a subscription to a channel it is letting go of once Redis has answered the SUBSCRIBE after its UNSUBSCRIBE", async () => {
    vi.useFakeTimers();
    const sub = createClient();
    const unsubscribed = Promise.withResolvers<number>();
    const subscribedAgain = Promise.withResolvers<number>();
    sub.unsubscribe.mockImplementationOnce(() => unsubscribed.promise);
    const pubsub = adapterOn(createClient(), sub);
    const stop = await pubsub.subscribe("room", () => undefined);
    sub.subscribe.mockImplementationOnce(() => subscribedAgain.promise);
    const settled: string[] = [];

    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(sub.unsubscribe.mock.calls).toEqual([["room"]]);
    void pubsub.subscribe("room", () => undefined).then(() => settled.push("room"));
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS / 2);
    expect(settled).toEqual([]);

    unsubscribed.resolve(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(sub.subscribe.mock.calls).toEqual([["room"], ["room"]]);
    expect(settled).toEqual([]);
    subscribedAgain.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual(["room"]);
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

  it("is ready again after a reconnect once Redis has answered the SUBSCRIBEs it makes again, and at their deadline at the latest", async () => {
    vi.useFakeTimers();
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    await pubsub.subscribe("room", () => undefined);
    const states: string[] = [];
    pubsub.onStateChange((state) => states.push(state));
    const answer = Promise.withResolvers<number>();
    sub.subscribe
      .mockImplementationOnce(() => answer.promise)
      .mockImplementationOnce(() => new Promise<number>(() => undefined));

    sub.become("close");
    sub.become("ready");
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS - 1);
    expect(states).toEqual(["degraded"]);
    answer.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["degraded", "ready"]);

    sub.become("close");
    sub.become("ready");
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS - 1);
    expect(states).toEqual(["degraded", "ready", "degraded"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(states).toEqual(["degraded", "ready", "degraded", "ready"]);
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

  it("lets go of a channel no handler wanted by the time Redis answered its SUBSCRIBE", async () => {
    vi.useFakeTimers();
    const sub = createClient();
    const reply = Promise.withResolvers<number>();
    sub.subscribe.mockImplementationOnce(() => reply.promise);
    const pubsub = adapterOn(createClient(), sub);
    /* Settled at its deadline, Redis yet to answer. */
    const subscribing = pubsub.subscribe("room", () => undefined);
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
    vi.useRealTimers();
    expect(sub.subscribe.mock.calls).toEqual([["room"]]);

    (await subscribing)();
    reply.resolve(1);

    await expect.poll(() => sub.unsubscribe.mock.calls).toEqual([["room"]]);
    await expect.poll(() => pubsub.stats().channels).toEqual({ wanted: 0, confirmed: 0 });
  });

  it("lets go, once reconnected, of a channel held as the connection was lost and wanted no more", async () => {
    const sub = createClient();
    const pubsub = adapterOn(createClient(), sub);
    const leave = await pubsub.subscribe("room", () => undefined);
    await expect.poll(() => pubsub.stats().channels.confirmed).toBe(1);

    sub.become("close");
    leave();
    sub.become("ready");

    await expect.poll(() => sub.unsubscribe.mock.calls).toEqual([["room"]]);
  });

  it("lets go of a channel wanted no more whose SUBSCRIBE is answered once reconnected", async () => {
    const sub = createClient();
    const reply = Promise.withResolvers<number>();
    sub.subscribe.mockImplementationOnce(() => reply.promise);
    const pubsub = adapterOn(createClient(), sub);
    const subscribing = pubsub.subscribe("room", () => undefined);
    await expect.poll(() => sub.subscribe.mock.calls).toEqual([["room"]]);

    /* The connection lost, subscribe() waits for Redis no more. */
    sub.become("close");
    (await subscribing)();
    sub.become("ready");
    reply.resolve(1);

    await expect.poll(() => sub.unsubscribe.mock.calls).toEqual([["room"]]);
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
    const pub = createClient();
    const sub = createClient();
    const pubsub = adapterOn(pub, sub);
    const heard: unknown[] = [];
    const errors: string[] = [];
    pubsub.onError((error) => errors.push(error.message));
    await pubsub.subscribe("room", (message) => heard.push(message));
    await pubsub.publish("room", "own");

    sub.emit("message", ...sentBy(pub));
    sub.emit("message", "room", "not-json{{");
    sub.emit("message", "room", JSON.stringify("hello"));

    expect(heard).toEqual([]);
    expect(errors).toEqual([
      'Not a Courier message on channel "room"',
      'Not a Courier message on channel "room"',
    ]);
  });

  it("hears another adapter made from the same configuration, an origin named in it too", async () => {
    const config = { prefix: "courier:", origin: "pod-1" } as Partial<RedisPubSubConfig>;
    const fromA = createClient();
    const toB = createClient();
    const a = adapterOn(fromA, createClient(), config);
    const b = adapterOn(createClient(), toB, config);
    const heard: unknown[] = [];
    await b.subscribe("room", (message) => heard.push(message));

    await a.publish("room", "from a");
    toB.emit("message", ...sentBy(fromA));

    expect(heard).toEqual(["from a"]);
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

/* A publisher whose Redis answers each PUBLISH only when `answer` is called, the oldest first. */
function slowClient() {
  const client = createClient("ready");
  const unanswered: Array<() => void> = [];
  client.publish.mockImplementation(
    () => new Promise<number>((resolve) => unanswered.push(() => resolve(1))),
  );
  return Object.assign(client, {
    answer(count = 1) {
      for (const reply of unanswered.splice(0, count)) reply();
    },
  });
}

/* What reached Redis, by the message each PUBLISH carried, in the order it was sent. */
const sentPayloads = (publisher: Client): unknown[] =>
  publisher.publish.mock.calls.map(([, payload]) => JSON.parse(payload).payload);

describe("createRedisPubSub while Redis is slow to answer", () => {
  it("sends Redis no more than its bounds hold unanswered, and the rest in order as it answers", async () => {
    const pub = slowClient();
    const pubsub = adapterOn(pub, createClient(), { queue: { maxMessages: 3 } });

    for (const message of [1, 2, 3, 4, 5]) void pubsub.publish("room", message);

    expect(sentPayloads(pub)).toEqual([1, 2, 3]);
    expect(pubsub.stats()).toMatchObject({ inFlight: { messages: 3 }, queued: { messages: 2 } });
    pub.answer();
    await expect.poll(() => sentPayloads(pub)).toEqual([1, 2, 3, 4]);
    pub.answer(2);
    await expect.poll(() => sentPayloads(pub)).toEqual([1, 2, 3, 4, 5]);
    pub.answer(2);
    await expect
      .poll(() => pubsub.stats())
      .toMatchObject({
        inFlight: { messages: 0, bytes: 0 },
        queued: { messages: 0 },
        published: 5,
        dropped: 0,
      });
  });

  it("sends a message larger than its bytes bound once nothing else holds them", async () => {
    const pub = slowClient();
    const pubsub = adapterOn(pub, createClient(), { queue: { maxBytes: 200 } });

    void pubsub.publish("room", "x".repeat(500));
    void pubsub.publish("room", "after");

    expect(sentPayloads(pub)).toEqual(["x".repeat(500)]);
    pub.answer();
    await expect.poll(() => sentPayloads(pub)).toEqual(["x".repeat(500), "after"]);
  });

  it("settles a publish past its bounds once queued, and one within them at the answer or maxAgeMs", async () => {
    vi.useFakeTimers();
    const pub = slowClient();
    const pubsub = adapterOn(pub, createClient(), { queue: { maxMessages: 1, maxAgeMs: 1_000 } });
    const settled: string[] = [];

    void pubsub.publish("room", "sent").then(() => settled.push("sent"));
    void pubsub.publish("room", "queued").then(() => settled.push("queued"));
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toEqual(["queued"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual(["queued", "sent"]);
    expect(pubsub.stats().inFlight.messages).toBe(1);
    pub.answer();
    await vi.advanceTimersByTimeAsync(0);

    expect(sentPayloads(pub)).toEqual(["sent", "queued"]);
  });

  it("sends Courier's commands it holds before the events, and lets no event take their place", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pub = createClient("reconnecting");
    const pubsub = adapterOn(pub, createClient(), { queue: { maxMessages: 3 } });

    await pubsub.publish("room", "event 1");
    await pubsub.publish("control", "command", { control: true });
    for (const message of ["event 2", "event 3", "event 4"]) await pubsub.publish("room", message);
    pub.become("ready");

    expect(sentPayloads(pub)).toEqual(["command", "event 3", "event 4"]);
    expect(pubsub.stats().dropped).toBe(2);
  });

  it("lets an event go where commands hold the room, and the oldest command for a command", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pub = createClient("reconnecting");
    const pubsub = adapterOn(pub, createClient(), { queue: { maxMessages: 2 } });

    for (const command of ["command 1", "command 2"]) {
      await pubsub.publish("control", command, { control: true });
    }
    await pubsub.publish("room", "event");
    await pubsub.publish("control", "command 3", { control: true });
    pub.become("ready");

    expect(sentPayloads(pub)).toEqual(["command 2", "command 3"]);
    expect(pubsub.stats().dropped).toBe(2);
  });
});
