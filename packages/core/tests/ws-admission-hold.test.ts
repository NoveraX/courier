/**
 * What a client sends while the server's `onConnect` decides whether to
 * admit its connection: a client subscribes as soon as its socket opens,
 * and the server holds those frames until the connection is admitted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { courier } from "../src/define/courier";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();
let served: ServedWS | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await stopWS(served);
  served = undefined;
});

const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: (ctx) => ctx.send("welcome"),
    onMessage: (ctx, message) => ctx.send(`echo ${message}`),
  }));

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

  it("is closed with 4429 when it sends more than it may before then", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let admit: () => void = () => {};
    served = await serveWS(
      { room },
      {
        maxSubscriptionsPerConnection: 2,
        onConnect: () => new Promise<undefined>((resolve) => (admit = () => resolve(undefined))),
      },
    );
    const socket = new WebSocket(served.url);
    const closed = new Promise<number>((resolve) => {
      socket.onclose = (event) => resolve(event.code);
    });
    await new Promise((resolve) => {
      socket.onopen = resolve;
    });

    for (let i = 0; i < 5; i++) socket.send(JSON.stringify({ type: "ping" }));

    expect(await closed).toBe(4429);
    admit();
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
