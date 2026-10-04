/**
 * A message too large for the server, end to end on a real `ws` server.
 *
 * The client refuses it with a 4413 on its channel rather than sending it,
 * and the server refuses one that arrives with a 4413 on a socket that stays
 * open. A socket `ws` closes with 1009 is reconnected, its channels told
 * why, so the subscriptions sharing it go on.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

import { createWSHandler } from "../src/adapter/handle-ws";
import { courier } from "../src/define/courier";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import type { RealtimeError } from "../src/realtime/errors";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { settle } from "./helpers/ws-server";

const { channel } = courier();

let server: Server | undefined;
const sockets: WebSocket[] = [];
const heard: unknown[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets.splice(0)) socket.terminate();
  clearWSConnectionPool();
  _resetSourcesForTests();
  heard.length = 0;
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

const room = channel
  .send(z.object({ text: z.string() }))
  .response<string>()
  .implement(() => ({
    onMessage(ctx, message) {
      heard.push(message.text.length);
      ctx.send(`heard ${message.text.length}`);
    },
  }));

const ticker = channel.response<number>().implement(async function* (ctx) {
  let n = 0;
  while (!ctx.signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    yield ++n;
  }
});

/** Serve `api.live.room` and `api.live.ticker`, reading frames up to `maxPayload`. */
async function serve(maxPayload?: number): Promise<string> {
  registerSources({
    api: { options: { groups: { live: { options: {}, room, ticker } } } },
  } as never);
  const handler = createWSHandler();
  server = createServer();
  attachWebSocketUpgrade(server, {
    path: "/api/ws",
    ...(maxPayload !== undefined && { maxPayload }),
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`;
}

/** A channel and a push subscription sharing one socket. */
function openBoth(url: string, maxMessageSize?: number) {
  const config = maxMessageSize === undefined ? undefined : { maxMessageSize };
  const ch = executeWSChannel<{ text: string }, string>(url, "api.live.room", undefined, config);
  const data: string[] = [];
  const errors: RealtimeError[] = [];
  ch.on("data", (message) => data.push(message));
  ch.on("error", (error) => errors.push(error));
  const ticks: number[] = [];
  const push = executeWSPush<number>(url, "api.live.ticker");
  const reading = (async () => {
    for await (const event of push) ticks.push(event.data);
  })();
  return { ch, data, errors, ticks, push, reading };
}

describe("a message larger than the limit", () => {
  it("is refused by the client with a 4413 on its channel, and nothing else ends", async () => {
    const url = await serve();
    const both = openBoth(url);
    await settle(100);

    both.ch.send({ text: "x".repeat(70_000) });
    await settle(100);
    const ticksAfter = both.ticks.length;
    both.ch.send({ text: "small" });
    await settle(100);

    expect(both.errors.map((error) => error.code)).toEqual([4413]);
    expect(heard).toEqual([5]);
    expect(both.data).toEqual(["heard 5"]);
    expect(both.ch.status).toBe("connected");
    expect(both.ticks.length).toBeGreaterThan(ticksAfter);
    both.ch.close();
    both.push.close();
    await both.reading;
  });

  it("is refused by the server with a 4413 on a socket that stays open", async () => {
    const url = await serve();
    const socket = new WebSocket(url);
    sockets.push(socket);
    const frames: { type: string; error?: { code: number } }[] = [];
    socket.on("message", (raw) => frames.push(JSON.parse(String(raw)) as { type: string }));
    await new Promise((resolve) => socket.once("open", resolve));

    socket.send(
      JSON.stringify({ type: "message", topic: "api.live.room", payload: "x".repeat(70_000) }),
    );
    socket.send(JSON.stringify({ type: "ping" }));
    await settle(100);

    expect(frames.map((frame) => frame.error?.code ?? frame.type)).toEqual([4413, "pong"]);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("a socket the server closes with 1009", () => {
  it("tells the channels why and reconnects, so the other subscriptions go on", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const url = await serve(1_024);
    const both = openBoth(url);
    await settle(100);

    both.ch.send({ text: "x".repeat(2_000) });
    await vi.waitFor(() => expect(both.errors.map((error) => error.code)).toEqual([1009]), {
      timeout: 3_000,
    });
    await vi.waitFor(() => expect(both.ch.status).toBe("connected"), { timeout: 5_000 });
    const ticksAfter = both.ticks.length;
    await settle(150);

    expect(both.ticks.length).toBeGreaterThan(ticksAfter);
    expect(both.push.status).toBe("connected");
    both.ch.close();
    both.push.close();
    await both.reading;
  });
});
