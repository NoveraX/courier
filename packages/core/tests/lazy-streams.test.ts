/**
 * The proxy client loads its SSE and WebSocket code on the first stream or
 * channel, so a bundle that makes none does not carry it. What it hands back
 * meanwhile behaves as the loaded client will: it connects, holds listeners
 * and messages, and closes, before the code has arrived.
 */
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../src/errors/configuration-error";
import { ConnectionError } from "../src/realtime/errors";
import type { ConnectionStatus, SSEEvent, SSESubscription, WSChannel } from "../src/realtime/types";
import { lazySSEFactory, lazyWSChannelFactory } from "../src/transport/lazy-streams";
import type { SSEFactory, WSChannelFactory } from "../src/transport/types";

function subscription(events: unknown[]): SSESubscription<unknown> & { closed: boolean } {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const sub = {
    closed: false,
    status: "connected" as ConnectionStatus,
    dropped: 0,
    async *[Symbol.asyncIterator](): AsyncGenerator<SSEEvent<unknown>, void, unknown> {
      for (const data of events) yield { data };
    },
    close() {
      sub.closed = true;
      sub.status = "disconnected";
      for (const listener of statusListeners) listener("disconnected");
    },
    on(_event: "status", handler: (status: ConnectionStatus) => void) {
      statusListeners.add(handler);
      return () => statusListeners.delete(handler);
    },
  };
  return sub;
}

function channel(): WSChannel<unknown, unknown> & { sent: unknown[]; closed: boolean } {
  return {
    sent: [],
    closed: false,
    status: "connected",
    send(data: unknown) {
      this.sent.push(data);
      return true;
    },
    on: () => () => undefined,
    close() {
      this.closed = true;
    },
  };
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
    const real = subscription([1, 2]);
    const load = deferred<SSEFactory>();
    const statuses: ConnectionStatus[] = [];

    const sub = lazySSEFactory(() => load.promise)("live", "ticks", undefined, {});
    sub.on("status", (status) => statuses.push(status));
    expect(sub.status).toBe("connecting");
    load.resolve(() => real);

    const events: unknown[] = [];
    for await (const event of sub) events.push(event.data);
    sub.close();

    expect(events).toEqual([1, 2]);
    expect(statuses).toEqual(["connected", "disconnected"]);
  });

  it("closes the loaded stream when it was closed before the client arrived", async () => {
    const real = subscription([1]);
    const load = deferred<SSEFactory>();

    const sub = lazySSEFactory(() => load.promise)("live", "ticks", undefined, {});
    sub.close();
    load.resolve(() => real);
    const events: unknown[] = [];
    for await (const event of sub) events.push(event);

    expect([real.closed, events, sub.status]).toEqual([true, [], "disconnected"]);
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
    load.resolve(() => real);
    await load.promise;
    await Promise.resolve();

    expect([accepted, real.sent]).toEqual([
      [true, true],
      ["a", "b"],
    ]);
  });

  it("drops what is sent once closed, and closes the channel that loads", async () => {
    const real = channel();
    const load = deferred<WSChannelFactory>();

    const ch = lazyWSChannelFactory(() => load.promise)("chat", "room", undefined, {});
    ch.close();
    const accepted = ch.send("late");
    load.resolve(() => real);
    await load.promise;
    await Promise.resolve();

    expect([accepted, real.sent, real.closed]).toEqual([false, [], true]);
  });

  it("tells a status the channel reached before it was followed", async () => {
    const real = channel();
    const statuses: ConnectionStatus[] = [];

    const ch = lazyWSChannelFactory(async () => () => real)("chat", "room", undefined, {});
    ch.on("status", (status) => statuses.push(status));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statuses).toEqual(["connected"]);
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toEqual([expect.any(ConnectionError)]);
    expect([ch.status, ch.send("x")]).toEqual(["disconnected", false]);
  });
});
