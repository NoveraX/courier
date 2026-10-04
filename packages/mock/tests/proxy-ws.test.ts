/**
 * The mock stands in for a Courier proxy's WebSocket route, `/api/ws`, as it
 * does for its HTTP and stream routes: a proxy caller pointed at the mock
 * with `proxyPath.ws` subscribes to its channels there, one socket carrying
 * every subscription by topic, so a proxy caller's channel can be mocked
 * rather than meeting a 404.
 */
import { createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { decodeMessage, encodeMessage, type WSMessage } from "@noverax/courier/internal";
import type { RealtimeError } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { createMockServer } from "../src/server/create-mock-server";

const { channel } = courier();
const Members = z.object({ room: z.string(), nick: z.string() });
const Said = z.object({ text: z.string().trim() });

interface Line {
  from: string;
  text: string;
}

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
            .response<Line>()
            .implement(() => ({ onMessage() {} })),
        },
      }),
    },
  });
}

type ChatApi = ReturnType<typeof chatApi>;

const running: Array<{ stop(): Promise<void> }> = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of running.splice(0)) await server.stop();
});

async function serve() {
  const left: string[] = [];
  const server = createAutoMockServer({
    source: chatApi(),
    port: 0,
    log: false,
    overrides: (mock) => {
      mock("chat", "room").channel((call) => {
        const { nick } = Members.parse(call.variables);
        return {
          onJoin(ctx) {
            ctx.send({ from: "mock", text: `welcome ${nick}` });
          },
          onMessage(ctx, message) {
            const { text } = Said.parse(message);
            if (text === "bye") return ctx.close(4000, "Room closed");
            ctx.send({ from: "echo", text });
            ctx.broadcast(ctx.topic, { from: nick, text });
          },
          onLeave() {
            left.push(nick);
          },
        };
      });
    },
  });
  running.push(server);
  const { url } = await server.start();
  return { server, left, ws: `${url.replace(/^http/, "ws")}/api/ws` };
}

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

/** Join over a socket of its own, as another browser would. */
function join(wsUrl: string, room: string, nick: string) {
  const caller = createProxyCaller<ChatApi>("shop", {
    source: chatApi(),
    proxyPath: { ws: `${wsUrl}?as=${nick}` },
  });
  const ch = caller.chat.room({ room, nick });
  const data: Line[] = [];
  const errors: RealtimeError[] = [];
  ch.on("data", (line) => data.push(line));
  ch.on("error", (error) => errors.push(error));
  return { ch, data, errors };
}

describe("a proxy caller pointed at the mock", () => {
  it("joins a mocked channel, keyed by its topic, and hears what the mock sends", async () => {
    const { ws } = await serve();
    const alice = join(ws, "r1", "alice");
    const bob = join(ws, "r1", "bob");
    const carol = join(ws, "r2", "carol");
    await settle();

    alice.ch.send({ text: "  hi  " });
    await settle();

    expect(alice.data).toEqual([
      { from: "mock", text: "welcome alice" },
      { from: "echo", text: "hi" },
    ]);
    expect(bob.data).toEqual([
      { from: "mock", text: "welcome bob" },
      { from: "alice", text: "hi" },
    ]);
    expect(carol.data).toEqual([{ from: "mock", text: "welcome carol" }]);
    for (const member of [alice, bob, carol]) member.ch.close();
  });

  it("carries several subscriptions on one socket, and ends one without the other", async () => {
    const { server, ws, left } = await serve();
    const opened: string[] = [];
    server.requestHooks.onStart = (id, _verb, path, group, method) =>
      opened.push(`${id} ${path} ${group}.${method}`);
    const caller = createProxyCaller<ChatApi>("shop", { source: chatApi(), proxyPath: { ws } });
    const r1 = caller.chat.room({ room: "r1", nick: "alice" });
    const r2 = caller.chat.room({ room: "r2", nick: "alice" });
    const r1Errors: RealtimeError[] = [];
    const r2Data: Line[] = [];
    r1.on("error", (error) => r1Errors.push(error));
    r2.on("data", (line) => r2Data.push(line));
    await settle();

    r1.send({ text: "bye" });
    r2.send({ text: "still here" });
    await settle();

    const sockets = new Set(opened.map((line) => line.split("_")[0]));
    expect(opened).toHaveLength(2);
    expect(sockets.size).toBe(1);
    expect(opened.every((line) => line.includes(" /api/ws chat.room"))).toBe(true);
    expect(r1Errors.map((error) => error.code)).toEqual([4000]);
    expect(r2Data.at(-1)).toEqual({ from: "echo", text: "still here" });
    expect(left).toEqual(["alice"]);
    r2.close();
  });
});

async function open(wsUrl: string): Promise<{ socket: WebSocket; frames: WSMessage[] }> {
  const socket = new WebSocket(wsUrl);
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

describe("the proxy's WebSocket protocol, frame by frame", () => {
  it("renames a subscription to the topic its key gives, then confirms it", async () => {
    const { ws } = await serve();
    const { socket, frames } = await open(ws);

    socket.send(
      encodeMessage({
        type: "subscribe",
        id: "1",
        topic: ROOM,
        payload: { room: "r1", nick: "ada" },
      }),
    );
    await settle();

    expect(frames.slice(0, 3)).toEqual([
      { type: "renamed", id: "1", topic: ROOM, payload: SERVED },
      { type: "data", topic: SERVED, payload: { from: "mock", text: "welcome ada" } },
      { type: "subscribed", id: "1", topic: SERVED },
    ]);
  });

  it("ends a subscription it cannot serve with the reason, and keeps the socket", async () => {
    const { ws } = await serve();
    const { socket, frames } = await open(ws);

    socket.send(encodeMessage({ type: "subscribe", id: "1", topic: ROOM, payload: { room: 1 } }));
    socket.send(
      encodeMessage({ type: "subscribe", id: "2", topic: "shop.chat.lobby", payload: {} }),
    );
    socket.send(encodeMessage({ type: "subscribe", id: "3", topic: "lonely", payload: {} }));
    socket.send(encodeMessage({ type: "ping" }));
    await settle();

    const ends = frames.filter((frame) => frame.type === "complete");
    const byId = ends.map((frame) => [frame.id, frame.error?.code, frame.error?.message]).sort();
    expect(byId).toEqual([
      ["1", 4422, "Invalid variables"],
      ["2", 4404, 'No channel mock for "chat.lobby" in state "Started"'],
      ["3", 4400, "Topic must include source name"],
    ]);
    expect(frames.filter((frame) => frame.type === "pong")).toHaveLength(1);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it("refuses a message on a topic it does not hold, or one its schema refuses", async () => {
    const { ws } = await serve();
    const { socket, frames } = await open(ws);
    socket.send(
      encodeMessage({ type: "message", id: "m0", topic: SERVED, payload: { text: "hi" } }),
    );
    socket.send(
      encodeMessage({
        type: "subscribe",
        id: "1",
        topic: ROOM,
        payload: { room: "r1", nick: "ada" },
      }),
    );
    await settle();

    socket.send(encodeMessage({ type: "message", id: "m1", topic: SERVED, payload: { text: 7 } }));
    await settle();

    const refusals = frames.filter((frame) => frame.type === "error");
    expect(refusals.map((frame) => [frame.id, frame.error?.code, frame.error?.message])).toEqual([
      ["m0", 4404, "Not subscribed"],
      ["m1", 4422, "Invalid message payload"],
    ]);
  });

  it("confirms an unsubscribe once the channel has left", async () => {
    const { ws, left } = await serve();
    const { socket, frames } = await open(ws);
    socket.send(
      encodeMessage({
        type: "subscribe",
        id: "1",
        topic: ROOM,
        payload: { room: "r1", nick: "ada" },
      }),
    );
    await settle();

    socket.send(encodeMessage({ type: "unsubscribe", id: "2", topic: SERVED }));
    await settle();

    expect(frames.at(-1)).toEqual({ type: "unsubscribed", id: "2", topic: SERVED });
    expect(left).toEqual(["ada"]);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("a mock server built without a source", () => {
  it("serves its mocked channels on the proxy's route, checking nothing it was not told of", async () => {
    const server = createMockServer({ port: 0, log: false });
    running.push(server);
    server.mock("chat", "room").channel(() => ({
      onMessage(ctx, message) {
        ctx.send(message);
      },
    }));
    const { url } = await server.start();
    const { socket, frames } = await open(`${url.replace(/^http/, "ws")}/api/ws`);

    socket.send(
      encodeMessage({ type: "subscribe", id: "1", topic: "shop.chat.room", payload: {} }),
    );
    await settle();
    socket.send(
      encodeMessage({ type: "message", topic: "shop.chat.room", payload: { any: "thing" } }),
    );
    await settle();

    expect(frames).toEqual([
      { type: "subscribed", id: "1", topic: "shop.chat.room" },
      { type: "data", topic: "shop.chat.room", payload: { any: "thing" } },
    ]);
  });
});
