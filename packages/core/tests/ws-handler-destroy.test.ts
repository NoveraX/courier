/**
 * How a WebSocket handler stops: every connection closed — one still
 * being admitted too — and waited for within a deadline, sockets handed
 * to it from then on closed at once, its pub/sub subscriptions let go of
 * without waiting on the adapter; and a second stop is the first.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import type { PubSubAdapter } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

beforeEach(() => {
  registerSources({ api: { options: { expose: true, groups: {} } } } as never);
});

afterEach(() => {
  _resetSourcesForTests();
});

function serve(config: WSHandlerConfig = {}) {
  return createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
}

function open(handler: ReturnType<typeof serve>, socket = createFakeSocket()): FakeSocket {
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive(authFrame());
  return socket;
}

/** A socket that takes a close and never says it closed, as a peer gone silent. */
function silentSocket(): FakeSocket {
  const socket = createFakeSocket();
  socket.close = (code, reason) => {
    socket.closed ??= { code, reason, at: Date.now() };
  };
  return socket;
}

/** An adapter whose subscriptions never settle: Redis away, its commands queued. */
function unanswered(): PubSubAdapter {
  return { ...createMemoryBus().replica("away"), subscribe: () => new Promise(() => undefined) };
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | "still waiting"> {
  return Promise.race([
    promise,
    new Promise<"still waiting">((resolve) => setTimeout(() => resolve("still waiting"), ms)),
  ]);
}

describe("WSHandler.destroy()", () => {
  it("closes every connection with 1001, and settles once they have closed", async () => {
    const handler = serve();
    const sockets = [open(handler), open(handler)];
    await expect.poll(() => handler.connections.count).toBe(2);

    await handler.destroy();

    expect(sockets.map((socket) => socket.closed?.code)).toEqual([1001, 1001]);
    expect(sockets[0]?.closed?.reason).toBe("Server shutting down");
    expect(handler.connections.count).toBe(0);
  });

  it("settles within its deadline though a socket never closes", async () => {
    const handler = serve();
    const socket = open(handler, silentSocket());
    await expect.poll(() => handler.connections.count).toBe(1);

    const started = Date.now();
    await handler.destroy({ timeoutMs: 100 });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(socket.closed?.code).toBe(1001);
  });

  it("closes at once a socket handed to it once it is stopping", async () => {
    const handler = serve();
    const stopping = handler.destroy();

    const late = open(handler);

    expect(late.closed?.code).toBe(1001);
    await stopping;
    expect(handler.connections.count).toBe(0);
  });

  it("closes a connection still being admitted, which is never registered", async () => {
    let admit: (meta: object) => void = () => undefined;
    const handler = serve({ onConnect: () => new Promise((resolve) => (admit = resolve)) });
    const socket = open(handler);
    socket.receive({ type: "auth", payload: { auth: { userId: "u1" } } });

    await handler.destroy({ timeoutMs: 500 });
    admit({ userId: "u1" });

    expect(socket.closed?.code).toBe(1001);
    await Promise.resolve();
    expect(handler.connections.count).toBe(0);
  });

  it("lets go of its subscriptions without waiting on a pub/sub adapter that never answers", async () => {
    const handler = serve({ pubsub: unanswered() });
    open(handler);
    await expect.poll(() => handler.connections.count).toBe(1);

    expect(
      await within(
        handler.destroy().then(() => "settled"),
        2_000,
      ),
    ).toBe("settled");
  });

  it("is the same stop when called again", async () => {
    const handler = serve();
    const socket = open(handler);
    let closes = 0;
    const close = socket.close.bind(socket);
    socket.close = (code, reason) => {
      closes++;
      close(code, reason);
    };

    const first = handler.destroy();
    const second = handler.destroy({ timeoutMs: 1 });

    expect(second).toBe(first);
    await first;
    expect(closes).toBe(1);
  });
});
