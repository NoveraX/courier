/**
 * Resuming a subscription from the position a client counted: with a
 * handler's `history`, the events after it are sent, numbered, before
 * `onJoin`, which reads `ctx.recovered`; a position the history does not
 * reach, another epoch, or no position at all is answered `recovered:
 * false`. A topic its last subscriber left is held for `maxAgeMs`, its
 * events numbered and kept, so the subscriber can come back for them; and
 * once the pub/sub adapter is back from an outage, each subscription is
 * told `resync`.
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
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const joined: boolean[] = [];
const { channel } = courier();
const room = channel
  .variables<{ room: string }>()
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: (ctx) => {
      joined.push(ctx.recovered);
      if (!ctx.recovered) ctx.send("snapshot");
    },
    onMessage: () => undefined,
  }));
const ROOM = qualifyTopic("api.live.room", { room: "a" });

const handlers: WSHandler[] = [];

beforeEach(() => {
  joined.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room } } } },
  } as Sources);
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

function open(handler: WSHandler): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  return socket;
}

async function subscribe(socket: FakeSocket, since?: unknown, id = "s1"): Promise<WSMessage> {
  socket.receive({
    type: "subscribe",
    id,
    topic: ROOM,
    payload: { room: "a" },
    ...(since !== undefined && { since }),
  } as WSMessage);
  await expect
    .poll(() => socket.sent.find((m) => m.type === "subscribed" && m.id === id))
    .toBeDefined();
  return socket.sent.find((m) => m.type === "subscribed" && m.id === id) as WSMessage;
}

const eventsOf = (socket: FakeSocket) =>
  socket.sent.filter((m) => m.type === "data" && m.seq !== undefined).map((m) => m.seq);

describe("resuming a subscription", () => {
  it("sends the events after the position, numbered, before onJoin, which reads recovered", async () => {
    const handler = serve({ history: {} });
    const first = await subscribe(open(handler));
    for (const text of ["one", "two", "three"])
      await handler.connections.broadcastToTopic(ROOM, text);

    const again = open(handler);
    const resumed = await subscribe(again, { seq: 1, epoch: first.epoch });

    expect(eventsOf(again)).toEqual([2, 3]);
    expect(resumed).toMatchObject({ seq: 3, epoch: first.epoch, recovered: true });
    expect(joined).toEqual([false, true]);
    expect(again.sent.some((m) => m.payload === "snapshot")).toBe(false);
  });

  it.each([
    ["another epoch", () => ({ seq: 1, epoch: "elsewhere" })],
    ["no position at all", () => "from the start"],
    ["a position before what is kept", () => ({ seq: 0, epoch: "" })],
  ])("answers recovered: false for %s, and subscribes all the same", async (_case, since) => {
    const handler = serve({ history: { maxEvents: 2 } });
    const first = await subscribe(open(handler));
    for (const text of ["one", "two", "three"])
      await handler.connections.broadcastToTopic(ROOM, text);
    const position = since() as { epoch?: string } | string;
    const asked =
      typeof position === "object" && position.epoch === ""
        ? { seq: 0, epoch: first.epoch }
        : position;

    const again = open(handler);
    const answered = await subscribe(again, asked);

    expect(answered).toMatchObject({ seq: 3, recovered: false });
    expect(eventsOf(again)).toEqual([]);
    expect(joined.at(-1)).toBe(false);
  });

  it("answers recovered: false on a handler that keeps no history", async () => {
    const handler = serve();
    const first = await subscribe(open(handler));
    await handler.connections.broadcastToTopic(ROOM, "one");

    expect(await subscribe(open(handler), { seq: 0, epoch: first.epoch })).toMatchObject({
      recovered: false,
    });
  });

  it("holds a topic its last subscriber left, keeping its events, so the subscriber resumes", async () => {
    const handler = serve({ history: { maxAgeMs: 60_000 } });
    const alone = open(handler);
    const first = await subscribe(alone);
    alone.emit("close", { code: 1006 });
    await expect.poll(() => handler.stats().subscriptions).toBe(0);

    await handler.connections.broadcastToTopic(ROOM, "while away");
    await handler.connections.broadcastToTopic(ROOM, "still away");
    const back = open(handler);
    const resumed = await subscribe(back, { seq: first.seq, epoch: first.epoch });

    expect(eventsOf(back)).toEqual([1, 2]);
    expect(resumed).toMatchObject({ seq: 2, epoch: first.epoch, recovered: true });
  });

  it("lets a held topic go once maxAgeMs has passed without a subscriber", async () => {
    const handler = serve({ history: { maxAgeMs: 50 } });
    const alone = open(handler);
    const first = await subscribe(alone);
    alone.emit("close", { code: 1006 });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const back = await subscribe(open(handler), { seq: first.seq, epoch: first.epoch });

    expect(back).toMatchObject({ seq: 0, recovered: false });
    expect(back.epoch).not.toBe(first.epoch);
  });
});

describe("a pub/sub adapter back from an outage", () => {
  it("tells each live subscription resync, and resumes nothing from before it", async () => {
    const listeners = new Set<(state: AdapterState) => void>();
    const inner = createMemoryBus().replica("replica");
    const pubsub: PubSubAdapter = {
      ...inner,
      onStateChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const handler = serve({ pubsub, history: {} });
    const live = open(handler);
    const first = await subscribe(live);
    await handler.connections.broadcastToTopic(ROOM, "before");

    for (const listener of listeners) listener("degraded");
    for (const listener of listeners) listener("ready");

    await expect
      .poll(() => live.sent)
      .toContainEqual({ type: "resync", topic: ROOM, seq: 1, epoch: first.epoch });
    expect(await subscribe(open(handler), { seq: 0, epoch: first.epoch })).toMatchObject({
      recovered: false,
    });
  });
});
