/**
 * A topic's events on replicas whose adapters share a log: numbered once,
 * the same on every replica — the sender's too — and sent in that order; a
 * subscription resumes from the log on any replica, what comes live
 * meanwhile held until what it missed is sent; events a replica missed are
 * read from the log and sent before the next, or, when the log no longer
 * keeps them or began another sequence, the subscribers are told `resync`;
 * and back from an outage, a replica catches each topic up from the log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { WS_SERVER_LIMITS } from "../src/adapter/ws-server-limits";
import type { WSHandler } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type {
  AdapterState,
  LoggedPosition,
  PubSubAdapter,
  TopicLog,
} from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const joined: boolean[] = [];
const { channel } = courier();
const room = channel
  .variables<{ room: string }>()
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: (ctx) => {
      joined.push(ctx.recovered);
    },
    onMessage: (ctx, text) => ctx.broadcast(ctx.topic, text),
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

function serve(pubsub: PubSubAdapter): WSHandler {
  const handler = createWSHandler({ pubsub, heartbeatIntervalMs: 60_000 });
  handlers.push(handler);
  return handler;
}

function open(handler: WSHandler): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive(authFrame());
  return socket;
}

function asked(socket: FakeSocket, since?: unknown, id = "s1"): void {
  socket.receive({
    type: "subscribe",
    id,
    topic: ROOM,
    payload: { room: "a" },
    ...(since !== undefined && { since }),
  } as WSMessage);
}

const answerOf = (socket: FakeSocket, id = "s1") =>
  socket.sent.find((m) => m.type === "subscribed" && m.id === id);

async function subscribe(socket: FakeSocket, since?: unknown): Promise<WSMessage> {
  asked(socket, since);
  await expect.poll(() => answerOf(socket)).toBeDefined();
  return answerOf(socket) as WSMessage;
}

const eventsOf = (socket: FakeSocket) =>
  socket.sent
    .filter((m) => m.type === "data" && m.seq !== undefined)
    .map((m) => [m.seq, m.payload]);

const resyncsOf = (socket: FakeSocket) => socket.sent.filter((m) => m.type === "resync");

async function publish(handler: WSHandler, ...texts: string[]): Promise<void> {
  for (const text of texts) await handler.connections.broadcastToTopic(ROOM, text);
}

/** A replica's adapter whose subscriber hears what `hear` lets through, as one whose connection dropped would. */
function hearing(
  pubsub: PubSubAdapter,
  hear: (logged: LoggedPosition) => LoggedPosition | undefined,
): PubSubAdapter {
  return {
    ...pubsub,
    subscribe: (topic, handler) =>
      pubsub.subscribe(topic, (message, logged) => {
        const heard = logged && hear(logged);
        if (!logged || heard) handler(message, heard);
      }),
  };
}

const losing = (pubsub: PubSubAdapter, lost: readonly number[]) =>
  hearing(pubsub, (logged) => (lost.includes(logged.seq) ? undefined : logged));

/** A replica's adapter whose log's reads wait for `release`, counting them. */
function slowReads(pubsub: PubSubAdapter) {
  const log = pubsub.log as TopicLog;
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reads = { count: 0 };
  const adapter: PubSubAdapter = {
    ...pubsub,
    log: {
      ...log,
      read: async (topic, from, upTo) => {
        reads.count++;
        await released;
        return log.read(topic, from, upTo);
      },
    },
  };
  return { adapter, reads, release: () => release() };
}

describe("a topic's events on replicas that share a log", () => {
  it("are numbered once, the same on every replica, the sender's too, and sent in order", async () => {
    const bus = createMemoryBus({ log: {} });
    const replicas = ["a", "b", "c"].map((name) => serve(bus.replica(name)));
    const sockets = replicas.map(open);
    const answers = await Promise.all(sockets.map((socket) => subscribe(socket)));

    await publish(replicas[0] as WSHandler, "one");
    await publish(replicas[1] as WSHandler, "two");
    await publish(replicas[2] as WSHandler, "three");

    for (const socket of sockets) {
      await expect
        .poll(() => eventsOf(socket))
        .toEqual([
          [1, "one"],
          [2, "two"],
          [3, "three"],
        ]);
    }
    expect(new Set(answers.map((answer) => answer.epoch)).size).toBe(1);
  });

  it("send the sender skip, on its own replica, and the event to every other subscriber", async () => {
    const bus = createMemoryBus({ log: {} });
    const [a, b] = [serve(bus.replica("a")), serve(bus.replica("b"))];
    const [sender, near, far] = [open(a), open(a), open(b)];
    for (const socket of [sender, near, far]) await subscribe(socket);

    sender.receive({ type: "message", topic: ROOM, payload: "hello" });

    await expect.poll(() => eventsOf(far)).toEqual([[1, "hello"]]);
    await expect.poll(() => eventsOf(near)).toEqual([[1, "hello"]]);
    expect(sender.sent).toContainEqual({ type: "skip", topic: ROOM, seq: 1 });
    expect(eventsOf(sender)).toEqual([]);
  });

  it("are read from the log when a replica missed some, and sent before the next", async () => {
    const bus = createMemoryBus({ log: {} });
    const a = serve(bus.replica("a"));
    const there = open(serve(losing(bus.replica("b"), [2, 3])));
    await subscribe(there);

    await publish(a, "one", "two", "three", "four");

    await expect
      .poll(() => eventsOf(there))
      .toEqual([
        [1, "one"],
        [2, "two"],
        [3, "three"],
        [4, "four"],
      ]);
    expect(resyncsOf(there)).toEqual([]);
  });

  it("are followed by resync where the log no longer keeps what a replica missed", async () => {
    const bus = createMemoryBus({ log: { maxEvents: 1 } });
    const a = serve(bus.replica("a"));
    const there = open(serve(losing(bus.replica("b"), [2, 3])));
    const { epoch } = await subscribe(there);

    await publish(a, "one", "two", "three", "four");

    await expect
      .poll(() => eventsOf(there))
      .toEqual([
        [1, "one"],
        [4, "four"],
      ]);
    expect(resyncsOf(there)).toEqual([{ type: "resync", topic: ROOM, seq: 3, epoch }]);
  });

  it("are followed by resync once the log began another sequence", async () => {
    const bus = createMemoryBus({ log: {} });
    const a = serve(bus.replica("a"));
    const renewed = (logged: LoggedPosition) =>
      logged.seq < 3 ? logged : { seq: logged.seq - 2, epoch: "renewed" };
    const there = open(serve(hearing(bus.replica("b"), renewed)));
    await subscribe(there);

    await publish(a, "one", "two", "three");

    await expect
      .poll(() => eventsOf(there))
      .toEqual([
        [1, "one"],
        [2, "two"],
        [1, "three"],
      ]);
    expect(resyncsOf(there)).toEqual([{ type: "resync", topic: ROOM, seq: 0, epoch: "renewed" }]);
  });

  it("are caught up from the log once a replica's adapter is back from an outage", async () => {
    const bus = createMemoryBus({ log: {} });
    const a = serve(bus.replica("a"));
    const listeners = new Set<(state: AdapterState) => void>();
    const there = open(
      serve({
        ...losing(bus.replica("b"), [2]),
        onStateChange: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
    );
    await subscribe(there);
    await publish(a, "one", "two");
    await expect.poll(() => eventsOf(there)).toEqual([[1, "one"]]);

    for (const listener of listeners) listener("degraded");
    for (const listener of listeners) listener("ready");

    await expect
      .poll(() => eventsOf(there))
      .toEqual([
        [1, "one"],
        [2, "two"],
      ]);
    expect(resyncsOf(there)).toEqual([]);
  });
});

describe("resuming a subscription from the log", () => {
  async function missedThree(bus: ReturnType<typeof createMemoryBus>) {
    const a = serve(bus.replica("a"));
    const first = open(a);
    const { epoch } = await subscribe(first);
    await publish(a, "one", "two", "three");
    await expect.poll(() => eventsOf(first)).toHaveLength(3);
    first.emit("close", { code: 1006 });
    return { a, epoch: epoch as string };
  }

  it("sends what it missed on another replica, before onJoin, which reads recovered", async () => {
    const bus = createMemoryBus({ log: {} });
    const { epoch } = await missedThree(bus);

    const again = open(serve(bus.replica("b")));
    const resumed = await subscribe(again, { seq: 1, epoch });

    expect(eventsOf(again)).toEqual([
      [2, "two"],
      [3, "three"],
    ]);
    expect(resumed).toMatchObject({ seq: 3, epoch, recovered: true });
    expect(joined).toEqual([false, true]);
  });

  it.each([
    ["another epoch", (epoch: string) => ({ seq: 1, epoch: `${epoch}x` })],
    ["a position before what the log keeps", (epoch: string) => ({ seq: 0, epoch })],
  ])("answers recovered: false for %s", async (_case, since) => {
    const bus = createMemoryBus({ log: { maxEvents: 2 } });
    const { epoch } = await missedThree(bus);

    const again = open(serve(bus.replica("b")));
    const answered = await subscribe(again, since(epoch));

    expect(answered).toMatchObject({ seq: 3, epoch, recovered: false });
    expect(eventsOf(again)).toEqual([]);
    expect(joined.at(-1)).toBe(false);
  });

  it("holds what comes live while it reads, and sends it after what it missed", async () => {
    const bus = createMemoryBus({ log: {} });
    const { a, epoch } = await missedThree(bus);
    const slow = slowReads(bus.replica("b"));
    const again = open(serve(slow.adapter));

    asked(again, { seq: 1, epoch });
    await expect.poll(() => slow.reads.count).toBe(1);
    await publish(a, "four");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(eventsOf(again)).toEqual([]);
    slow.release();

    await expect.poll(() => answerOf(again)).toMatchObject({ seq: 4, recovered: true });
    expect(eventsOf(again)).toEqual([
      [2, "two"],
      [3, "three"],
      [4, "four"],
    ]);
  });

  it("resumes nothing once more comes live than it holds, and sends that in order", async () => {
    const bus = createMemoryBus({ log: {} });
    const { a, epoch } = await missedThree(bus);
    const slow = slowReads(bus.replica("b"));
    const again = open(serve(slow.adapter));
    const live = Array.from(
      { length: WS_SERVER_LIMITS.RESUME_HELD_FRAMES + 1 },
      (_, i) => `${i + 4}`,
    );

    asked(again, { seq: 1, epoch });
    await expect.poll(() => slow.reads.count).toBe(1);
    await publish(a, ...live);
    await expect.poll(() => eventsOf(again)).toHaveLength(live.length);
    slow.release();

    await expect.poll(() => answerOf(again)).toMatchObject({ recovered: false });
    expect(eventsOf(again)).toEqual(live.map((text, i) => [i + 4, text]));
  });

  it("resumes nothing when the log does not answer within LOG_TIMEOUT_MS", async () => {
    const bus = createMemoryBus({ log: {} });
    const { epoch } = await missedThree(bus);
    const slow = slowReads(bus.replica("b"));
    const again = open(serve(slow.adapter));
    vi.useFakeTimers();

    asked(again, { seq: 1, epoch });
    await vi.advanceTimersByTimeAsync(WS_SERVER_LIMITS.LOG_TIMEOUT_MS);

    expect(answerOf(again)).toMatchObject({ seq: 3, recovered: false });
    expect(eventsOf(again)).toEqual([]);
  });
});
