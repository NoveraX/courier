/**
 * A WebSocket client that leaves while `onConnect` is still running.
 *
 * A close during `onConnect` is heard: the connection leaves the registry,
 * its heartbeat timer stops, `onDisconnect` runs and the address gets its
 * slot back, so clients giving up during a slow token lookup do not lock
 * their address out for the life of the process.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import { defineApi } from "../src/define";
import type { WebSocketLike } from "../src/realtime/adapters";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const ADDRESS = { "X-Forwarded-For": "203.0.113.7" };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  _resetSourcesForTests();
  vi.useRealTimers();
});

type Socket = WebSocketLike & {
  emit(type: string, event?: unknown): void;
  closedWith?: number | undefined;
  sent: string[];
};

function createSocket(): Socket {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const socket: Socket = {
    readyState: 1,
    bufferedAmount: 0,
    sent: [],
    send(data) {
      socket.sent.push(data);
    },
    close(code) {
      socket.closedWith = code;
    },
    addEventListener(type: string, handler: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler as (event: unknown) => void]);
    },
    emit(type, event) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
  };
  return socket;
}

function handlerWith(config: WSHandlerConfig) {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
  return createWSHandler(config);
}

function connect(handler: ReturnType<typeof createWSHandler>): Socket {
  const socket = createSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws", { headers: ADDRESS }));
  return socket;
}

describe("a client that leaves while onConnect runs", () => {
  it("is not registered once onConnect resolves", async () => {
    const handler = handlerWith({ onConnect: () => wait(20).then(() => ({ user: "u1" })) });

    connect(handler).emit("close", { code: 1001 });
    await wait(40);

    expect(handler.connections.count).toBe(0);
  });

  it("gives its address's slot back", async () => {
    const handler = handlerWith({
      maxConnectionsPerIP: 3,
      onConnect: () => wait(20).then(() => ({})),
    });

    for (let i = 0; i < 4; i += 1) connect(handler).emit("close", { code: 1001 });
    await wait(40);
    const next = connect(handler);
    await wait(40);

    expect(next.closedWith).toBeUndefined();
    expect(handler.connections.count).toBe(1);
  });

  it("leaves no heartbeat running", async () => {
    vi.useFakeTimers();
    const handler = handlerWith({
      heartbeatIntervalMs: 1_000,
      onConnect: () => wait(20).then(() => ({})),
    });
    const socket = connect(handler);
    socket.emit("close", { code: 1001 });
    await vi.advanceTimersByTimeAsync(20);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(socket.sent).toEqual([]);
    expect(socket.closedWith).toBeUndefined();
  });

  it("lets onDisconnect undo what onConnect set up", async () => {
    const onDisconnect = vi.fn();
    const handler = handlerWith({
      onConnect: () => wait(20).then(() => ({ user: "u1" })),
      onDisconnect,
    });

    connect(handler).emit("close", { code: 1001 });
    await wait(40);

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { user: "u1" }, code: 1001 }),
    );
  });
});

describe("a client that stays while onConnect runs", () => {
  it("is registered once onConnect resolves", async () => {
    const handler = handlerWith({ onConnect: () => wait(20).then(() => ({ user: "u1" })) });

    connect(handler);
    await wait(40);

    expect(handler.connections.count).toBe(1);
    expect(handler.connections.list()[0]?.meta).toEqual({ user: "u1" });
  });
});
