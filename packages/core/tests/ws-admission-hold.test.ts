/**
 * What a client sends while the server's `onConnect` decides whether to
 * admit its connection: a client subscribes as soon as its socket opens,
 * and the server holds those frames until the connection is admitted. The
 * first frame is read as it comes, before any frame after it is taken in,
 * so the socket is answered the same however its reads cut what it sent:
 * a first frame that is no `auth` of the protocol's version is refused
 * with 1002, and more than it may send — its `auth` among it — with 4429.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();
let served: ServedWS | undefined;
const handlers: WSHandler[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy()));
  await stopWS(served);
  served = undefined;
  _resetSourcesForTests();
});

const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: (ctx) => ctx.send("welcome"),
    onMessage: (ctx, message) => ctx.send(`echo ${message}`),
  }));

const ping: WSMessage = { type: "ping" };
const pings = (count: number): WSMessage[] => Array.from({ length: count }, () => ping);

describe("a client whose connection onConnect is still deciding on", () => {
  it("is subscribed once it is admitted, and hears what the channel sends", async () => {
    served = await serveWS(
      { room },
      {
        onConnect: async () => {
          await settle(150);
          return { user: "u1" };
        },
      },
    );
    const ch = executeWSChannel<string, string>(served.url, "api.live.room");
    const heard: string[] = [];
    ch.on("data", (data) => heard.push(data));

    ch.send("hi");
    await vi.waitFor(() => expect(heard).toEqual(["welcome", "echo hi"]), { timeout: 2000 });
    ch.close();
  });

  it("is closed with 4429 when it sends more frames than it may before then, its auth among them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let admit: () => void = () => {};
    served = await serveWS(
      { room },
      {
        maxSubscriptionsPerConnection: 2,
        onConnect: () => new Promise<undefined>((resolve) => (admit = () => resolve(undefined))),
      },
    );
    const { socket, closed, frames } = await opened(served.url);

    /* Twice two subscriptions' worth of frames may come before admission: the auth and three more. */
    for (const frame of [authFrame(), ...pings(4)]) socket.send(JSON.stringify(frame));

    expect(await closed).toBe(4429);
    expect(frames).toEqual([
      expect.objectContaining({
        type: "auth_error",
        error: expect.objectContaining({ code: 4429 }),
      }),
    ]);
    admit();
  });

  it("is refused with 1002 when its first frame is no auth, however much it sends after it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS(
      { room },
      { maxSubscriptionsPerConnection: 2, onConnect: () => new Promise<undefined>(() => {}) },
    );
    const { socket, closed, frames } = await opened(served.url);

    for (const frame of pings(5)) socket.send(JSON.stringify(frame));

    expect(await closed).toBe(1002);
    expect(frames).toEqual([
      { type: "auth_error", error: { code: 1002, message: "The first frame is auth" }, v: 2 },
    ]);
  });

  it("is closed with 4429, and told why, once what it sends grows past four messages' worth", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let admit: () => void = () => {};
    served = await serveWS(
      { room },
      {
        maxMessageSize: 1_000,
        onConnect: () => new Promise<undefined>((resolve) => (admit = () => resolve(undefined))),
      },
    );
    const { socket, closed, frames } = await opened(served.url);

    socket.send(JSON.stringify({ type: "auth", v: 2, id: "a0" }));
    for (let i = 0; i < 5; i++)
      socket.send(JSON.stringify({ type: "ping", payload: "x".repeat(900) }));

    expect(await closed).toBe(4429);
    expect(frames).toEqual([
      expect.objectContaining({
        type: "auth_error",
        error: expect.objectContaining({ code: 4429 }),
      }),
    ]);
    admit();
  });

  it("is closed with 4429 for one frame larger than a message may be, which it does not hold", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let admit: () => void = () => {};
    served = await serveWS(
      { room },
      {
        maxMessageSize: 1_000,
        onConnect: () => new Promise<undefined>((resolve) => (admit = () => resolve(undefined))),
      },
    );
    const { socket, closed } = await opened(served.url);

    socket.send(JSON.stringify({ type: "auth", v: 2, id: "a0" }));
    socket.send("x".repeat(1_001));

    expect(await closed).toBe(4429);
    admit();
  });
});

/* Each read of a socket brings what it brings: every frame sent at once, or one at a time. */
describe.each([
  ["every frame in one read", true],
  ["a frame in each read", false],
])("a socket onConnect is still deciding on, %s", (_, together) => {
  it.each([
    {
      sent: "five pings and no auth",
      frames: pings(5),
      code: 1002,
      reason: "The first frame is auth",
    },
    {
      sent: "an auth whose header HTTP cannot carry, then four pings",
      frames: [authFrame({ headers: { "bad name": "x" } }), ...pings(4)],
      code: 4401,
      reason: "Invalid auth frame",
    },
    {
      sent: "an auth and four pings, a frame more than it may send",
      frames: [authFrame(), ...pings(4)],
      code: 4429,
      reason: "Too much sent before the connection was accepted",
    },
  ])("is answered for $sent with $code", async ({ frames, code, reason }) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { socket } = deciding();

    await deliver(socket, frames, together);

    await expect.poll(() => socket.closed).toMatchObject({ code, reason });
    expect(socket.sent).toEqual([expect.objectContaining({ type: "auth_error" })]);
  });

  it("holds an auth and three pings, as much as it may send, until it is admitted", async () => {
    const { socket, admit } = deciding();

    await deliver(socket, [authFrame(), ...pings(3)], together);
    admit();

    await expect
      .poll(() => socket.sent.map((frame) => frame.type))
      .toEqual(["auth_ok", "pong", "pong", "pong"]);
    expect(socket.closed).toBeUndefined();
  });
});

/* A socket of a handler that holds two subscriptions a connection, whose onConnect admits it on `admit()`. */
function deciding(): { socket: FakeSocket; admit: () => void } {
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room } } } },
  } as Sources);
  let admit: () => void = () => {};
  const decided = new Promise<undefined>((resolve) => (admit = () => resolve(undefined)));
  const handler = createWSHandler({
    heartbeatIntervalMs: 60_000,
    maxSubscriptionsPerConnection: 2,
    onConnect: () => decided,
  });
  handlers.push(handler);
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  return { socket, admit };
}

/* What a client sends, as one read brings it — every frame before the server reads any — or a frame a read. */
async function deliver(socket: FakeSocket, frames: readonly WSMessage[], together: boolean) {
  for (const frame of frames) {
    socket.receive(frame);
    if (!together) await new Promise((resolve) => setImmediate(resolve));
  }
}

/* A bare socket, open, with the frames the server sends it and the code it is closed with. */
async function opened(url: string) {
  const socket = new WebSocket(url);
  const frames: unknown[] = [];
  socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)));
  const closed = new Promise<number>((resolve) => {
    socket.onclose = (event) => resolve(event.code);
  });
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  return { socket, closed, frames };
}
