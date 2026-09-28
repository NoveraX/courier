/**
 * The events a runtime reports before its Studio socket is connected.
 *
 * `attachRuntime()` resolves before the socket connects, and a page fetches
 * its data as it loads, so the first requests an application made — the
 * ones a page load is made of — were dropped on the runtime's side and never
 * reached Studio. A real Socket.IO server stands in for Studio here.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { connectRuntimeSocket } from "../src/runtime/connect-runtime-socket";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

interface Studio {
  url: string;
  received: string[];
  io: Server;
}

async function studio(): Promise<Studio> {
  const http: HttpServer = createServer();
  const io = new Server(http);
  const received: string[] = [];
  io.of("/runtime").on("connection", (socket) => {
    socket.on("event", (event: { id: string }) => received.push(event.id));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    io.close();
  });
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`, received, io };
}

function started(id: string): AnyStudioEvent {
  return {
    id,
    type: "request:start",
    sessionId: "app",
    timestamp: Date.now(),
    source: "api",
    group: "users",
    method: "list",
    variables: undefined,
    mode: "direct",
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
  };
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function connect(url: string, bus: EventBus): Promise<void> {
  await connectRuntimeSocket({ runtimeId: "app", kind: "server", studioUrl: url, bus }, [], {
    setDisposer: (dispose) => cleanups.push(dispose),
    setAnnouncer: () => {},
  });
}

describe("events reported before the Studio socket connects", () => {
  it("reach Studio once it does, in order", async () => {
    const { url, received } = await studio();
    const bus = new EventBus();
    bus.emit(started("before-attach"));

    await connect(url, bus);
    bus.emit(started("while-connecting"));
    await until(() => received.length >= 2, "both events");
    bus.emit(started("connected"));
    await until(() => received.length >= 3, "the third event");

    expect(received).toEqual(["before-attach", "while-connecting", "connected"]);
  });

  it("reach Studio after it comes back, once each", async () => {
    const { url, received, io } = await studio();
    const bus = new EventBus();
    await connect(url, bus);
    bus.emit(started("first"));
    await until(() => received.length >= 1, "the first event");

    /* A dropped connection, as a Studio restart makes; the client reconnects on its own. */
    for (const socket of io.of("/runtime").sockets.values()) socket.conn.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    bus.emit(started("while-away"));
    await until(() => received.length >= 2, "the event made while away");

    expect(received).toEqual(["first", "while-away"]);
  });
});
