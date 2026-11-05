/**
 * The proxy client loads its SSE and WebSocket code on the first stream or
 * channel, so a bundle that makes none does not carry it. What it hands back
 * meanwhile behaves as the loaded client will: it connects, holds listeners
 * and messages, and closes, before the code has arrived.
 */
import { describe, expect, it, vi } from "vitest";

import { ConfigurationError } from "../src/errors/configuration-error";
import { ChannelHandle } from "../src/realtime/channel-handle";
import { ConnectionError } from "../src/realtime/errors";
import type { SubscriptionSink } from "../src/realtime/subscription-driver";
import { SubscriptionHandle } from "../src/realtime/subscription-handle";
import type { ConnectionStatus } from "../src/realtime/types";
import { lazySSEFactory, lazyWSChannelFactory } from "../src/transport/lazy-streams";
import { MAX_WAITING } from "../src/transport/lazy-subscription";
import type { SSEFactory, WSChannelFactory } from "../src/transport/types";

/* A subscription the test runs by hand: what it is told, the test tells it. */
function scripted() {
  let sink: SubscriptionSink<unknown> | undefined;
  let closed = false;
  const handle = new SubscriptionHandle<unknown>({
    open: (to) => {
      sink = to;
    },
    reconnect: () => undefined,
    close: () => {
      closed = true;
    },
  });
  return {
    handle,
    get sink(): SubscriptionSink<unknown> {
      if (!sink) throw new Error("not opened");
      return sink;
    },
    closed: () => closed,
  };
}

function channel() {
  const sent: unknown[] = [];
  let closed = false;
  let sink: SubscriptionSink<unknown> | undefined;
  const handle = new ChannelHandle<unknown, unknown>(
    {
      open: (to) => {
        sink = to;
      },
      reconnect: () => undefined,
      close: () => {
        closed = true;
      },
    },
    (data) => {
      sent.push(data);
      return true;
    },
  );
  return { handle, sent, closed: () => closed, open: () => sink?.open({ resumed: false }) };
}

/* A load the test releases by hand, to act while the client is still on its way. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("a stream opened while its client loads", () => {
  it("reports connecting, then carries the loaded stream's events and status", async () => {
    const real = scripted();
    const load = deferred<SSEFactory>();
    const statuses: ConnectionStatus[] = [];

    const sub = lazySSEFactory(() => load.promise)("live", "ticks", undefined, {});
    sub.on("status", (status) => statuses.push(status));
    const events: unknown[] = [];
    sub.on("data", (data) => events.push(data));
    expect(sub.status).toBe("connecting");
    load.resolve(() => real.handle);
    await load.promise;
    real.sink.open({ resumed: false });
    real.sink.data({ data: 1 });
    await vi.waitFor(() => expect(events).toEqual([1]));

    real.sink.data({ data: 2 });
    real.sink.end();

    expect(events).toEqual([1, 2]);
    expect(statuses).toEqual(["connected", "disconnected"]);
  });

  it("carries what the loaded stream held for its first reader", async () => {
    const real = scripted();
    real.sink.data({ data: "early" });

    const sub = lazySSEFactory(async () => () => real.handle)("live", "ticks", undefined, {});
    const events: unknown[] = [];
    sub.on("data", (data) => events.push(data));

    await expect.poll(() => events).toEqual(["early"]);
  });

  it("closes the loaded stream when it was closed before the client arrived", async () => {
    const real = scripted();
    const load = deferred<SSEFactory>();

    const sub = lazySSEFactory(() => load.promise)("live", "ticks", undefined, {});
    sub.close();
    load.resolve(() => real.handle);
    await load.promise;
    const events: unknown[] = [];
    for await (const event of sub) events.push(event);

    expect([real.handle.status, events, sub.status]).toEqual(["disconnected", [], "disconnected"]);
  });

  it("fails with a ConnectionError when the client cannot be loaded", async () => {
    const sub = lazySSEFactory(() => Promise.reject(new Error("chunk missing")))(
      "live",
      "ticks",
      undefined,
      {},
    );

    await expect(sub[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(ConnectionError);
    expect(sub.status).toBe("disconnected");
  });

  it("fails with what the loaded factory threw, not as a client that did not load", async () => {
    const refused = new ConfigurationError("WS_PATH_NOT_CONFIGURED", "no ws path");
    const sub = lazySSEFactory(async () => () => {
      throw refused;
    })("live", "ticks", undefined, {});

    await expect(sub[Symbol.asyncIterator]().next()).rejects.toBe(refused);
  });
});

describe("a channel opened while its client loads", () => {
  it("holds what is sent, and delivers it in order once the client arrives", async () => {
    const real = channel();
    const load = deferred<WSChannelFactory>();

    const ch = lazyWSChannelFactory(() => load.promise)("chat", "room", undefined, {});
    const accepted = [ch.send("a"), ch.send("b")];
    load.resolve(() => real.handle);

    await vi.waitFor(() => expect(real.sent).toEqual(["a", "b"]));
    expect(accepted).toEqual([true, true]);
  });

  it("drops what is sent once closed, and closes the channel that loads", async () => {
    const real = channel();
    const load = deferred<WSChannelFactory>();

    const ch = lazyWSChannelFactory(() => load.promise)("chat", "room", undefined, {});
    ch.close();
    const accepted = ch.send("late");
    load.resolve(() => real.handle);
    await load.promise;
    await Promise.resolve();

    expect([accepted, real.sent, real.closed()]).toEqual([false, [], true]);
  });

  it("tells a status the channel reached before it was followed", async () => {
    const real = channel();
    real.open();
    const statuses: ConnectionStatus[] = [];

    const ch = lazyWSChannelFactory(async () => () => real.handle)("chat", "room", undefined, {});
    ch.on("status", (status) => statuses.push(status));

    await expect.poll(() => statuses).toEqual(["connected"]);
  });

  it("reports a client that cannot be loaded on its error event", async () => {
    const errors: unknown[] = [];

    const ch = lazyWSChannelFactory(() => Promise.reject(new Error("chunk missing")))(
      "chat",
      "room",
      undefined,
      {},
    );
    ch.on("error", (error) => errors.push(error));

    await expect.poll(() => errors).toEqual([expect.any(ConnectionError)]);
    expect([ch.status, ch.send("x")]).toEqual(["disconnected", false]);
  });

  it("keeps what is sent within its bound, and refuses the rest with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const real = channel();
    const load = deferred<WSChannelFactory>();

    const ch = lazyWSChannelFactory(() => load.promise)("chat", "room", undefined, {});
    const accepted = Array.from({ length: MAX_WAITING + 2 }, (_, i) => ch.send(i));
    load.resolve(() => real.handle);

    await vi.waitFor(() => expect(real.sent).toHaveLength(MAX_WAITING));
    expect(accepted.filter(Boolean)).toHaveLength(MAX_WAITING);
    expect(accepted.slice(-2)).toEqual([false, false]);
    expect(warn.mock.calls.flat().join(" ")).toContain("no room is left");
    warn.mockRestore();
  });
});

describe("what a subscription is before its client loads", () => {
  it("refuses an event it does not have", () => {
    const sub = lazySSEFactory(() => new Promise<SSEFactory>(() => undefined))(
      "live",
      "ticks",
      undefined,
      {},
    );

    // @ts-expect-error — a subscription has no "message" event
    expect(() => sub.on("message", () => undefined)).toThrow(ConfigurationError);
  });

  it("has no send unless it is a channel", () => {
    const never = () => new Promise<never>(() => undefined);
    const sub = lazySSEFactory(never)("live", "ticks", undefined, {});
    const ch = lazyWSChannelFactory(never)("chat", "room", undefined, {});

    expect(["send" in sub, "send" in ch]).toEqual([false, true]);
  });

  it("tells a close before the client came once, in order", () => {
    const sub = lazySSEFactory(() => new Promise<SSEFactory>(() => undefined))(
      "live",
      "ticks",
      undefined,
      {},
    );
    const told: string[] = [];
    sub.on("status", (status) => told.push(`status ${status}`));
    sub.on("close", (info) => told.push(`close ${info.reason}`));

    sub.close();
    sub.close();

    expect(told).toEqual(["status disconnected", "close closed"]);
  });

  it("tells the others when one listener throws, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sub = lazySSEFactory(() => Promise.reject(new Error("chunk missing")))(
      "live",
      "ticks",
      undefined,
      {},
    );
    const told: string[] = [];
    sub.on("error", () => {
      throw new Error("listener bug");
    });
    sub.on("status", (status) => told.push(status));
    sub.on("close", (info) => told.push(info.reason));

    await expect.poll(() => told).toEqual(["disconnected", "failed"]);
    expect(logged.mock.calls.flat().join(" ")).toContain("A subscription's error listener failed");
    logged.mockRestore();
  });
});
