/**
 * A client that reads too slowly — its socket's buffer over
 * `maxBufferedAmount` — loses a topic's events and nothing else: a
 * subscription's confirmation and a `resync` still reach it. A subscription
 * that resumes while an event is dropped for it is answered `recovered:
 * false`, and its `onJoin` reads the same, so it sends what a fresh
 * subscriber is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type { AdapterState, PubSubAdapter } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const LIMIT = 1_000;
const OVER = 10 * LIMIT;
const joined: boolean[] = [];
/* What a join waits on before it is done, as one reading a database does. */
let reading: Promise<void> | undefined;
const { channel } = courier();
const room = channel
  .variables<{ room: string }>()
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: async (ctx) => {
      joined.push(ctx.recovered);
      await reading;
      if (!ctx.recovered) ctx.send("snapshot");
    },
    onMessage: () => undefined,
  }));
const roomOf = (name: string) => qualifyTopic("api.live.room", { room: name });

const handlers: WSHandler[] = [];

beforeEach(() => {
  joined.length = 0;
  reading = undefined;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room } } } },
  } as Sources);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({
    heartbeatIntervalMs: 60_000,
    maxBufferedAmount: LIMIT,
    ...config,
  });
  handlers.push(handler);
  return handler;
}

async function open(handler: WSHandler): Promise<FakeSocket> {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive(authFrame());
  await expect.poll(() => socket.sent.some((m) => m.type === "auth_ok")).toBe(true);
  return socket;
}

function subscribe(socket: FakeSocket, name: string, id: string, since?: unknown): void {
  socket.receive({
    type: "subscribe",
    id,
    topic: roomOf(name),
    payload: { room: name },
    ...(since !== undefined && { since }),
  } as WSMessage);
}

async function confirmation(socket: FakeSocket, id: string): Promise<WSMessage> {
  await expect
    .poll(() => socket.sent.find((m) => m.type === "subscribed" && m.id === id))
    .toBeDefined();
  return socket.sent.find((m) => m.type === "subscribed" && m.id === id) as WSMessage;
}

const payloadsOf = (socket: FakeSocket) =>
  socket.sent.filter((m) => m.type === "data").map((m) => m.payload);

describe("a client that reads too slowly", () => {
  it("is told a subscription runs, while the topic's events are dropped", async () => {
    const handler = serve();
    const socket = await open(handler);
    subscribe(socket, "a", "s1");
    await confirmation(socket, "s1");

    socket.bufferedAmount = OVER;
    await handler.connections.broadcastToTopic(roomOf("a"), "lost");
    subscribe(socket, "b", "s2");

    expect(await confirmation(socket, "s2")).toMatchObject({ topic: roomOf("b") });
    expect(payloadsOf(socket)).toEqual(["snapshot"]);
  });

  it("is told resync once the pub/sub adapter is back", async () => {
    const listeners = new Set<(state: AdapterState) => void>();
    const pubsub: PubSubAdapter = {
      ...createMemoryBus().replica("replica"),
      onStateChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const handler = serve({ pubsub });
    const socket = await open(handler);
    subscribe(socket, "a", "s1");
    const { epoch } = await confirmation(socket, "s1");

    socket.bufferedAmount = OVER;
    for (const listener of listeners) listener("degraded");
    for (const listener of listeners) listener("ready");

    await expect
      .poll(() => socket.sent.find((m) => m.type === "resync"))
      .toEqual({ type: "resync", topic: roomOf("a"), seq: 0, epoch });
  });

  it("resumes without recovering when an event it missed is dropped", async () => {
    const handler = serve({ history: {} });
    const live = await open(handler);
    subscribe(live, "a", "s1");
    const { epoch } = await confirmation(live, "s1");
    await handler.connections.broadcastToTopic(roomOf("a"), "missed");

    const back = await open(handler);
    const read = Promise.withResolvers<void>();
    reading = read.promise;
    back.bufferedAmount = OVER;
    subscribe(back, "a", "s2", { seq: 0, epoch });
    await expect.poll(() => joined.length).toBe(2);
    back.bufferedAmount = 0;
    read.resolve();

    expect(await confirmation(back, "s2")).toMatchObject({ seq: 1, recovered: false });
    expect(joined).toEqual([false, false]);
    expect(payloadsOf(back)).toEqual(["snapshot"]);
  });
});
