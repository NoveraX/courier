/**
 * The numbers a topic's events carry: dense from 1, the same for every
 * subscriber; a private frame — a snapshot, a pushed value, a frame sent to
 * one connection — and a notice to a base topic or to every connection
 * carry none; the sender a broadcast leaves out is sent `skip` with the
 * number; and `subscribed` states the last number counted and the topic's
 * epoch, which starts anew once no subscriber holds the topic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const { channel } = courier();
const room = channel
  .variables<{ room: string }>()
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: (ctx) => ctx.send("snapshot"),
    onMessage: (ctx, text) => ctx.broadcast(ctx.topic, text),
  }));
const feed = channel.response<number>().implement(async function* () {
  yield 1;
  yield 2;
});

const roomA = qualifyTopic("api.live.room", { room: "a" });
const roomB = qualifyTopic("api.live.room", { room: "b" });
const FEED = qualifyTopic("api.live.feed", {});

let handler: WSHandler;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room, feed } } } },
  } as Sources);
  handler = createWSHandler({ heartbeatIntervalMs: 60_000 });
});

afterEach(async () => {
  await handler.destroy({ timeoutMs: 100 });
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

async function subscribed(socket: FakeSocket, topic: string, payload: unknown, id = "s1") {
  socket.receive({ type: "subscribe", id, topic, payload });
  await expect
    .poll(() => socket.sent.find((m) => m.type === "subscribed" && m.id === id))
    .toBeDefined();
  return socket.sent.find((m) => m.type === "subscribed" && m.id === id) as WSMessage;
}

function open(): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  return socket;
}

const dataOf = (socket: FakeSocket, topic: string) =>
  socket.sent.filter((m) => m.type === "data" && m.topic === topic && m.payload !== "snapshot");

describe("the numbers a topic's events carry", () => {
  it("count each topic's events from 1, the same number for every subscriber", async () => {
    const [a, b, c] = [open(), open(), open()];
    await subscribed(a, roomA, { room: "a" });
    await subscribed(b, roomA, { room: "a" });
    await subscribed(c, roomB, { room: "b" });

    await handler.connections.broadcastToTopic(roomA, "one");
    await handler.connections.broadcastToTopic(roomA, "two");
    await handler.connections.broadcastToTopic(roomB, "other");

    for (const socket of [a, b]) {
      expect(dataOf(socket, roomA).map((m) => m.seq)).toEqual([1, 2]);
    }
    expect(dataOf(c, roomB).map((m) => m.seq)).toEqual([1]);
  });

  it("are carried by no private frame, and by no notice to a base topic or to every connection", async () => {
    const a = open();
    await subscribed(a, roomA, { room: "a" });
    await subscribed(a, FEED, {}, "s2");
    await expect
      .poll(() => a.sent.filter((m) => m.topic === FEED && m.type === "data"))
      .toHaveLength(2);
    const connectionId = handler.connections.list()[0]?.connectionId ?? "";

    handler.connections.sendToConnection(connectionId, roomA, "to one");
    handler.connections.send(connectionId, "to one, no topic");
    await handler.connections.broadcastToBaseTopic("api.live.room", "to every room");
    await handler.connections.broadcast("to everyone");

    const unnumbered = a.sent.filter((m) => m.type === "data");
    expect(unnumbered.length).toBe(7);
    expect(unnumbered.filter((m) => m.seq !== undefined)).toEqual([]);
  });

  it("are sent to the sender a broadcast leaves out as skip, with the number it was not sent", async () => {
    const [sender, other] = [open(), open()];
    await subscribed(sender, roomA, { room: "a" });
    await subscribed(other, roomA, { room: "a" });

    sender.receive({ type: "message", topic: roomA, payload: "hello" });

    await expect.poll(() => dataOf(other, roomA)).toMatchObject([{ seq: 1, payload: "hello" }]);
    expect(sender.sent).toContainEqual({ type: "skip", topic: roomA, seq: 1 });
    expect(dataOf(sender, roomA)).toEqual([]);
  });

  it("are counted up to in subscribed, with the topic's epoch, 0 for a topic with none yet", async () => {
    const first = open();
    const before = await subscribed(first, roomA, { room: "a" });
    await handler.connections.broadcastToTopic(roomA, "one");
    await handler.connections.broadcastToTopic(roomA, "two");

    const after = await subscribed(open(), roomA, { room: "a" });

    expect(before).toMatchObject({ seq: 0, epoch: expect.any(String) });
    expect(after).toMatchObject({ seq: 2, epoch: before.epoch });
  });

  it("start again in a new epoch once no subscriber holds the topic", async () => {
    const first = open();
    const before = await subscribed(first, roomA, { room: "a" });
    await handler.connections.broadcastToTopic(roomA, "one");
    first.receive({ type: "unsubscribe", topic: roomA });
    await expect.poll(() => handler.stats().topics).toBe(0);

    const again = await subscribed(open(), roomA, { room: "a" });

    expect(again.seq).toBe(0);
    expect(again.epoch).not.toBe(before.epoch);
  });
});
