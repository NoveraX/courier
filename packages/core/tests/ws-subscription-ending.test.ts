/**
 * What ends a WebSocket subscription ends that one alone, on a real handler:
 * a push the client subscribes to again in the turn it left it hears the
 * topic; a channel's join refused, or still sending, once its client has
 * left it says nothing to, and ends nothing of, the subscription that took
 * its place; a channel its client left while the log was asked where the
 * topic stands neither joins nor leaves; and of two subscribes to a topic
 * sent while the subscription before them still leaves, the one replaced is
 * ended before it joins, and the one before leaves once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type { PubSubAdapter, TopicLog } from "../src/realtime/adapters";
import { ForbiddenError } from "../src/realtime/errors";
import { createMemoryBus } from "../src/realtime/memory-bus";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const { channel } = courier();
const TOPIC = "api.live.feed";
const handlers: WSHandler[] = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

/** A handler serving `feed` at TOPIC, and a socket it let in. */
function serve(feed: unknown, pubsub?: PubSubAdapter) {
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, feed } } } },
  } as unknown as Sources);
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...(pubsub && { pubsub }) });
  handlers.push(handler);
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive(authFrame());
  return { handler, socket };
}

const subscribe = (socket: FakeSocket, id: string) =>
  socket.receive({ type: "subscribe", id, topic: TOPIC } as WSMessage);
const unsubscribe = (socket: FakeSocket, id: string) =>
  socket.receive({ type: "unsubscribe", id, topic: TOPIC } as WSMessage);

const answered = (socket: FakeSocket, type: string, id: string) =>
  socket.sent.some((m) => m.type === type && m.id === id);
const framesFor = (socket: FakeSocket, id: string) => socket.sent.filter((m) => m.id === id);
const payloadsOf = (socket: FakeSocket) =>
  socket.sent.filter((m) => m.type === "data").map((m) => m.payload);

/** A replica's adapter whose log says where a topic stands once `answer` is called. */
function slowPosition(pubsub: PubSubAdapter) {
  const log = pubsub.log as TopicLog;
  const answer = Promise.withResolvers<void>();
  const asked = { count: 0 };
  const adapter: PubSubAdapter = {
    ...pubsub,
    log: {
      ...log,
      position: async (topic) => {
        asked.count++;
        await answer.promise;
        return log.position(topic);
      },
    },
  };
  return { adapter, asked, answer: () => answer.resolve() };
}

describe("ending a subscription", () => {
  it("leaves a push subscribed to again in the turn it was left hearing the topic", async () => {
    const feed = channel.response<string>().implement(async function* (ctx) {
      yield "snapshot";
      await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
    });
    const { handler, socket } = serve(feed);
    subscribe(socket, "s1");
    await expect.poll(() => answered(socket, "subscribed", "s1")).toBe(true);

    unsubscribe(socket, "u1");
    subscribe(socket, "s2");
    await expect.poll(() => answered(socket, "subscribed", "s2")).toBe(true);
    await settle();
    await handler.connections.broadcastToTopic(TOPIC, "live");

    await expect.poll(() => payloadsOf(socket)).toEqual(["snapshot", "snapshot", "live"]);
  });

  it("says nothing of a join refused once its client left it, and keeps what took its place", async () => {
    const refusal = Promise.withResolvers<void>();
    let joins = 0;
    const room = channel
      .send<string>()
      .response<string>()
      .implement(() => ({
        onJoin: async () => {
          joins += 1;
          if (joins > 1) return;
          await refusal.promise;
          throw new ForbiddenError("Not a member of this room");
        },
        onMessage: () => undefined,
      }));
    const { handler, socket } = serve(room);
    subscribe(socket, "s1");
    await expect.poll(() => joins).toBe(1);
    unsubscribe(socket, "u1");
    await expect.poll(() => answered(socket, "unsubscribed", "u1")).toBe(true);
    subscribe(socket, "s2");
    await expect.poll(() => answered(socket, "subscribed", "s2")).toBe(true);

    refusal.resolve();
    await settle();
    await handler.connections.broadcastToTopic(TOPIC, "live");

    await expect.poll(() => payloadsOf(socket)).toEqual(["live"]);
    expect(framesFor(socket, "s1")).toEqual([]);
  });

  it("sends nothing of a join still running once its client left and subscribed again", async () => {
    const late = Promise.withResolvers<void>();
    let joins = 0;
    const room = channel
      .send<string>()
      .response<string>()
      .implement(() => ({
        onJoin: async (ctx) => {
          joins += 1;
          if (joins > 1) return ctx.send("joined again");
          await late.promise;
          ctx.send("joined late");
        },
        onMessage: () => undefined,
      }));
    const { socket } = serve(room);
    subscribe(socket, "s1");
    await expect.poll(() => joins).toBe(1);
    unsubscribe(socket, "u1");
    await expect.poll(() => answered(socket, "unsubscribed", "u1")).toBe(true);
    subscribe(socket, "s2");
    await expect.poll(() => answered(socket, "subscribed", "s2")).toBe(true);

    late.resolve();
    await settle();

    expect(payloadsOf(socket)).toEqual(["joined again"]);
  });

  it("neither joins nor leaves a channel its client left while the log was asked where the topic stands", async () => {
    let joins = 0;
    let leaves = 0;
    const room = channel
      .send<string>()
      .response<string>()
      .implement(() => ({
        onJoin: () => {
          joins += 1;
        },
        onMessage: () => undefined,
        onLeave: () => {
          leaves += 1;
        },
      }));
    const slow = slowPosition(createMemoryBus({ log: {} }).replica("a"));
    const { socket } = serve(room, slow.adapter);
    subscribe(socket, "s1");
    await expect.poll(() => slow.asked.count).toBeGreaterThan(0);
    unsubscribe(socket, "u1");
    await expect.poll(() => answered(socket, "unsubscribed", "u1")).toBe(true);

    slow.answer();
    await settle();

    expect({ joins, leaves }).toEqual({ joins: 0, leaves: 0 });
    expect(framesFor(socket, "s1")).toEqual([]);
  });

  it("ends the one replaced of two subscribes sent while the one before still leaves", async () => {
    const leaving = Promise.withResolvers<void>();
    const opened: { joined: number; left: number }[] = [];
    const room = channel
      .send<string>()
      .response<string>()
      .implement(() => {
        const held = { joined: 0, left: 0 };
        opened.push(held);
        return {
          onJoin: () => {
            held.joined += 1;
          },
          onMessage: () => undefined,
          onLeave: async () => {
            held.left += 1;
            if (held === opened[0]) await leaving.promise;
          },
        };
      });
    const { handler, socket } = serve(room);
    subscribe(socket, "s1");
    await expect.poll(() => answered(socket, "subscribed", "s1")).toBe(true);

    subscribe(socket, "s2");
    subscribe(socket, "s3");
    await expect.poll(() => opened[0]?.left).toBe(1);
    await settle();
    leaving.resolve();
    await expect.poll(() => answered(socket, "subscribed", "s3")).toBe(true);
    await settle();
    await handler.connections.broadcastToTopic(TOPIC, "live");

    await expect.poll(() => payloadsOf(socket)).toEqual(["live"]);
    expect(opened).toEqual([
      { joined: 1, left: 1 },
      { joined: 0, left: 0 },
      { joined: 1, left: 0 },
    ]);
    expect(answered(socket, "subscribed", "s2")).toBe(false);
  });
});
