/**
 * A topic's events on their way to an audience larger than one batch: each
 * goes out a batch at a time, the event loop running between batches, and
 * still every subscriber has the topic's events in the order of their
 * numbers — whoever left between two of them, the sender's `skip` in its
 * turn. A subscription confirmed while an event is still on its way to it
 * is sent the event first, so `subscribed` counts only what reached it;
 * and one resumed from the log is not sent again, by an event on its way
 * meanwhile, what it resumed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { createConnectionRegistry } from "../src/adapter/ws-registry";
import { createServerTopicManager } from "../src/adapter/ws-topics";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type { PubSubAdapter, TopicLog } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

/* More subscribers than a broadcast sends to before it lets the event loop run. */
const AUDIENCE = 600;
const ROOM = qualifyTopic("api.live.room", { room: "a" });

/* The next subscription's onJoin waits for `release`; `entered` settles once it was called. */
let holding: { entered: () => void; released: Promise<void> } | undefined;
const { channel } = courier();
const room = channel
  .variables<{ room: string }>()
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: async () => {
      const held = holding;
      holding = undefined;
      held?.entered();
      await held?.released;
    },
    onMessage: () => undefined,
  }));

function holdNextJoin(): { entered: Promise<void>; release: () => void } {
  let entered = (): void => undefined;
  let release = (): void => undefined;
  const joined = new Promise<void>((resolve) => {
    entered = resolve;
  });
  holding = {
    entered,
    released: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  return { entered: joined, release: () => release() };
}

const handlers: WSHandler[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room } } } },
  } as Sources);
});

afterEach(async () => {
  holding = undefined;
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

/* A registry and its topic manager, with `count` connections subscribed to ROOM, each the frames it was sent. */
function audienceOf(count: number) {
  const topics = createServerTopicManager();
  const registry = createConnectionRegistry();
  registry.setTopicManager(topics);
  const frames: Record<string, unknown>[][] = [];
  for (let i = 0; i < count; i++) {
    const sent: Record<string, unknown>[] = [];
    frames.push(sent);
    registry.add({
      connectionId: `c${i}`,
      meta: {},
      connectedAt: 0,
      sendRaw: () => undefined,
      sendEncoded: () => undefined,
      sendTopicEvent: (_topic, _position, encoded) => sent.push(JSON.parse(encoded)),
      close: () => undefined,
      requireAuth: () => () => undefined,
      evict: () => undefined,
    });
    topics.subscribe(`c${i}`, { topic: ROOM, cleanup: () => undefined });
  }
  return { registry, topics, frames };
}

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({
    heartbeatIntervalMs: 60_000,
    maxConnectionsPerIP: 1_000,
    ...config,
  });
  handlers.push(handler);
  return handler;
}

function open(handler: WSHandler): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive(authFrame());
  return socket;
}

function asked(socket: FakeSocket, since?: unknown): void {
  socket.receive({
    type: "subscribe",
    id: "s1",
    topic: ROOM,
    payload: { room: "a" },
    ...(since !== undefined && { since }),
  } as WSMessage);
}

const answerOf = (socket: FakeSocket) => socket.sent.find((m) => m.type === "subscribed");

const eventsOf = (socket: FakeSocket) =>
  socket.sent.filter((m) => m.type === "data" && m.seq !== undefined).map((m) => m.seq);

/* The events' numbers a socket was sent and its `subscribed`, in the order they were sent. */
const timelineOf = (socket: FakeSocket) =>
  socket.sent
    .filter((m) => m.type === "subscribed" || (m.type === "data" && m.seq !== undefined))
    .map((m) => (m.type === "subscribed" ? "subscribed" : m.seq));

/* A replica's adapter that takes no topic before it has heard an event: until then, each
   subscription it is to take waits for it, while what it hears reaches the replica. */
function takingOnceHeard(pubsub: PubSubAdapter): PubSubAdapter {
  let heard = (): void => undefined;
  const taken = new Promise<void>((resolve) => {
    heard = resolve;
  });
  return {
    ...pubsub,
    subscribe: (topic, handler) => {
      const subscribed = pubsub.subscribe(topic, (message, logged) => {
        handler(message, logged);
        heard();
      });
      return taken.then(() => subscribed);
    },
  };
}

describe("a topic's events on their way to a large audience", () => {
  it("reach each subscriber in the order of their numbers, whoever left between them", async () => {
    const { registry, topics, frames } = audienceOf(AUDIENCE);
    const first = registry.broadcastToTopic(ROOM, "one");
    await Promise.all(Array.from({ length: 100 }, (_, i) => topics.unsubscribe(`c${i}`, ROOM)));
    const second = registry.broadcastToTopic(ROOM, "two");
    await Promise.all([first, second]);

    expect(frames[AUDIENCE - 1]?.map((frame) => frame.seq)).toEqual([1, 2]);
  });

  it("send the sender skip in its turn, after the events before it", async () => {
    const { registry, frames } = audienceOf(AUDIENCE);
    const sender = `c${AUDIENCE - 1}`;
    await Promise.all([
      registry.broadcastToTopic(ROOM, "one"),
      registry.broadcastToTopic(ROOM, "two", sender),
    ]);

    expect(frames[AUDIENCE - 1]?.map(({ type, seq }) => [type, seq])).toEqual([
      ["data", 1],
      ["skip", 2],
    ]);
  });

  it("reach a subscription confirmed meanwhile before subscribed, which counts them", async () => {
    const handler = serve({ history: {} });
    const audience = Array.from({ length: AUDIENCE }, () => open(handler));
    for (const socket of audience) asked(socket);
    await expect.poll(() => audience.every(answerOf), { timeout: 5_000 }).toBe(true);
    await handler.connections.broadcastToTopic(ROOM, "one");

    const late = open(handler);
    const joining = holdNextJoin();
    asked(late, { seq: 1, epoch: answerOf(audience[0] as FakeSocket)?.epoch });
    await joining.entered;
    const sending = handler.connections.broadcastToTopic(ROOM, "two");
    joining.release();
    await sending;

    await expect.poll(() => answerOf(late)).toBeDefined();
    expect(timelineOf(late)).toEqual([2, "subscribed"]);
    expect(answerOf(late)).toMatchObject({ seq: 2, recovered: true });
  });

  it("send a subscription resumed from the log nothing again of what it resumed", async () => {
    const bus = createMemoryBus({ log: {} });
    const sender = bus.replica("b");
    const { epoch } = await (sender.log as TopicLog).position(ROOM);
    const replica = serve({ pubsub: takingOnceHeard(bus.replica("a")) });
    const audience = Array.from({ length: AUDIENCE }, () => open(replica));
    for (const socket of audience) asked(socket);
    const late = open(replica);
    asked(late, { seq: 0, epoch });
    await expect
      .poll(() => replica.connections.list().filter((info) => info.topicCount === 1).length)
      .toBe(AUDIENCE + 1);

    await serve({ pubsub: sender }).connections.broadcastToTopic(ROOM, "one");

    await expect.poll(() => [late, ...audience].every(answerOf), { timeout: 5_000 }).toBe(true);
    expect(eventsOf(late)).toEqual([1]);
    expect(answerOf(late)).toMatchObject({ seq: 1, recovered: true });
    expect(audience.flatMap(eventsOf)).toEqual([]);
  });
});
