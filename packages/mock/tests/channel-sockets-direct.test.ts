/**
 * A channel's own path on the mock server, where a direct caller connects,
 * served as the proxy's route serves its subscriptions — as a Courier server
 * does: variables and messages checked against the channel's schemas, the
 * topic keyed by its `.topic()` reader, the mock found in the scenario each
 * subscription is made in, each subscription logged on its own, and the
 * mock called with the headers of the client's `auth` frame.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { decodeMessage, encodeMessage, type WSMessage } from "@noverax/courier/internal";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import type { MockRequestContext } from "../src/types";

const { channel } = courier();
const Members = z.object({ room: z.string(), nick: z.string() });
const Said = z.object({ text: z.string() });

function chatApi() {
  return defineApi({
    name: "shop",
    baseURL: "http://placeholder.invalid",
    groups: {
      chat: defineGroup({
        prefix: "chat",
        endpoints: {
          room: channel
            .variables(Members)
            .topic((v) => ({ room: v.room }))
            .send(Said)
            .response<string>()
            .implement(() => ({ onMessage() {} })),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of running.splice(0)) await server.stop();
});

async function serve() {
  const calls: MockRequestContext[] = [];
  const server = createAutoMockServer({
    source: chatApi(),
    port: 0,
    log: false,
    overrides: (mock) => {
      mock("chat", "room")
        .inState("Started")
        .channel((call) => {
          calls.push(call);
          return {
            onJoin: (ctx) => ctx.send("welcome"),
            onMessage: (ctx, message) => ctx.send(`echo ${(message as { text: string }).text}`),
          };
        });
    },
  });
  running.push(server);
  const { url } = await server.start();
  return { server, calls, base: url.replace(/^http/, "ws") };
}

async function open(url: string): Promise<{ socket: WebSocket; frames: WSMessage[] }> {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const frames: WSMessage[] = [];
  socket.on("message", (raw) => frames.push(decodeMessage(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, frames };
}

const ROOM = 'shop.chat.room#{"nick":"ada","room":"r1"}';
const SERVED = 'shop.chat.room#{"room":"r1"}';
const ADA = { room: "r1", nick: "ada" };

function send(socket: WebSocket, message: WSMessage): void {
  socket.send(encodeMessage(message));
}

describe("a channel's own path", () => {
  it("keys the subscription by the channel's topic reader, then confirms it", async () => {
    const { base } = await serve();
    const { socket, frames } = await open(`${base}/chat/room`);

    send(socket, { type: "subscribe", id: "1", topic: ROOM, payload: ADA });

    await vi.waitFor(() =>
      expect(frames.slice(0, 3)).toEqual([
        { type: "renamed", id: "1", topic: ROOM, payload: SERVED },
        { type: "data", topic: SERVED, payload: "welcome" },
        { type: "subscribed", id: "1", topic: SERVED },
      ]),
    );
  });

  it("refuses variables and messages the channel's schemas refuse, and keeps the socket", async () => {
    const { base } = await serve();
    const { socket, frames } = await open(`${base}/chat/room`);

    send(socket, { type: "subscribe", id: "1", topic: "shop.chat.room", payload: { room: 1 } });
    send(socket, { type: "subscribe", id: "2", topic: ROOM, payload: ADA });
    await vi.waitFor(() => expect(frames.some((f) => f.type === "subscribed")).toBe(true));
    send(socket, { type: "message", id: "m1", topic: SERVED, payload: { text: 7 } });

    await vi.waitFor(() => {
      const end = frames.find((f) => f.type === "complete");
      const refusal = frames.find((f) => f.type === "error");
      expect([end?.id, end?.error?.code, end?.error?.message]).toEqual([
        "1",
        4422,
        "Invalid variables",
      ]);
      expect([refusal?.id, refusal?.error?.code]).toEqual(["m1", 4422]);
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it("finds the channel's mock in the scenario each subscription is made in", async () => {
    const { server, base } = await serve();
    const { socket, frames } = await open(`${base}/chat/room`);
    send(socket, { type: "subscribe", id: "1", topic: ROOM, payload: ADA });
    await vi.waitFor(() => expect(frames.some((f) => f.type === "subscribed")).toBe(true));

    server.applyScenario({ name: "closed", initialState: "Closed", apply: () => {} });
    send(socket, {
      type: "subscribe",
      id: "2",
      topic: 'shop.chat.room#{"room":"r2"}',
      payload: { room: "r2", nick: "grace" },
    });

    await vi.waitFor(() =>
      expect(frames.find((f) => f.type === "complete")).toMatchObject({
        id: "2",
        error: { code: 4404, message: 'No channel mock for "chat.room" in state "Closed"' },
      }),
    );
  });

  it("logs each subscription on its own, under the channel's path", async () => {
    const { server, base } = await serve();
    const started = vi.fn();
    server.requestHooks.onStart = started;
    const { socket, frames } = await open(`${base}/chat/room`);

    send(socket, { type: "subscribe", id: "1", topic: SERVED, payload: ADA });
    send(socket, {
      type: "subscribe",
      id: "2",
      topic: 'shop.chat.room#{"room":"r2"}',
      payload: { room: "r2", nick: "ada" },
    });
    await vi.waitFor(() => expect(frames.filter((f) => f.type === "subscribed")).toHaveLength(2));

    expect(started.mock.calls.map((call) => [call[2], call[5]])).toEqual([
      ["/chat/room", ADA],
      ["/chat/room", { room: "r2", nick: "ada" }],
    ]);
    expect(new Set(started.mock.calls.map((call) => call[0])).size).toBe(2);
  });
});

describe("a client's auth frame, on either route", () => {
  it.each([
    ["a channel's own path", "/chat/room"],
    ["the proxy's route", "/api/ws"],
  ])("gives %s's mocks the headers it carries, as a Courier server reads them", async (_, path) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { base, calls } = await serve();
    const { socket, frames } = await open(`${base}${path}`);

    send(socket, {
      type: "auth",
      payload: { headers: { authorization: "Bearer t1", cookie: "sid=mallory" } },
    });
    send(socket, { type: "subscribe", id: "1", topic: SERVED, payload: ADA });
    await vi.waitFor(() => expect(frames.some((f) => f.type === "subscribed")).toBe(true));

    expect(calls[0]?.headers.get("authorization")).toBe("Bearer t1");
    expect(calls[0]?.headers.has("cookie")).toBe(false);
  });
});
