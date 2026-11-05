/**
 * WebSocket handlers whose Redis adapters keep the log: a topic's events
 * carry the same numbers on every replica, a subscription resumes from the
 * log on another replica, and a replica whose subscriber connection was
 * cut is caught up from the log once it is back — its subscribers sent
 * what they missed, in order, and told no resync.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { createWSHandler, type WSHandler } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import type { PubSubAdapter, WebSocketLike } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPubSub } from "../src/redis-pubsub";
import { REDIS_URL, redisAnswers, redisClients } from "./helpers/redis-clients";
import { type RedisRelay, startRelay } from "./helpers/redis-relay";

const { channel } = courier();
const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onJoin: () => undefined, onMessage: () => undefined }));
const api = defineApi({ expose: true, baseURL: "https://upstream.example", endpoints: { room } });

const available = await redisAnswers();
const redis = redisClients();
const relays: RedisRelay[] = [];
const adapters: PubSubAdapter[] = [];
const handlers: WSHandler[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 200 })));
  await Promise.all(adapters.splice(0).map((adapter) => adapter.disconnect({ timeoutMs: 500 })));
  await redis.end();
  for (const relay of relays.splice(0)) await relay.close();
});

/** A replica: a handler on an adapter with a log, its subscriber connection the one given. */
function replica(subscriber: Redis = redis.client()) {
  const pubsub = createRedisPubSub({
    publisher: redis.client(),
    subscriber,
    prefix: redis.prefix,
    log: {},
  });
  adapters.push(pubsub);
  const handler = createWSHandler({ pubsub, heartbeatIntervalMs: 60_000, sources: { api } });
  handlers.push(handler);
  return { handler, pubsub };
}

type Frame = Record<string, unknown>;

function open(handler: WSHandler) {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as Frame[],
    send(data: string) {
      socket.sent.push(JSON.parse(data) as Frame);
    },
    close() {
      socket.readyState = 3;
    },
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as (event: unknown) => void]);
    },
    receive(frame: Frame) {
      for (const listener of listeners.get("message") ?? [])
        listener({ data: JSON.stringify(frame) });
    },
  };
  handler.handleSocket(
    socket as WebSocketLike,
    new Request("http://localhost/api/ws"),
    "203.0.113.9",
  );
  /* Its first frame is auth, as a Courier client's is. */
  socket.receive({ type: "auth", v: 2, id: "a0" });
  return socket;
}

type Socket = ReturnType<typeof open>;

async function subscribe(socket: Socket, since?: unknown): Promise<Frame> {
  socket.receive({ type: "subscribe", id: "s1", topic: "api.room", ...(since ? { since } : {}) });
  await expect.poll(() => socket.sent.find((m) => m.type === "subscribed")).toBeDefined();
  return socket.sent.find((m) => m.type === "subscribed") as Frame;
}

/* Every channel the replica asked for, confirmed by Redis: what is published from now on reaches it. */
async function hearing(pubsub: PubSubAdapter): Promise<void> {
  await expect
    .poll(() => {
      const { wanted, confirmed } = pubsub.stats().channels;
      return wanted > 0 && wanted === confirmed;
    })
    .toBe(true);
}

const eventsOf = (socket: Socket) =>
  socket.sent
    .filter((m) => m.type === "data" && m.seq !== undefined)
    .map((m) => [m.seq, m.payload]);

describe.skipIf(!available)(
  "replicas whose Redis adapters keep the log",
  { timeout: 20_000 },
  () => {
    it("number a topic's events alike, and resume a subscription on another replica", async () => {
      const [a, b] = [replica(), replica()];
      const [onA, onB] = [open(a.handler), open(b.handler)];
      const { topic, epoch } = await subscribe(onA);
      await subscribe(onB);
      await Promise.all([hearing(a.pubsub), hearing(b.pubsub)]);

      for (const text of ["one", "two", "three"])
        await a.handler.connections.broadcastToTopic(String(topic), text);

      for (const socket of [onA, onB]) {
        await expect
          .poll(() => eventsOf(socket))
          .toEqual([
            [1, "one"],
            [2, "two"],
            [3, "three"],
          ]);
      }
      const again = open(b.handler);
      const resumed = await subscribe(again, { seq: 1, epoch });
      expect(eventsOf(again)).toEqual([
        [2, "two"],
        [3, "three"],
      ]);
      expect(resumed).toMatchObject({ seq: 3, epoch, recovered: true });
    });

    it("catch a replica up from the log once its subscriber connection is back", async () => {
      const outage = await startRelay(new URL(REDIS_URL));
      relays.push(outage);
      const a = replica();
      const b = replica(redis.client(outage));
      const [onA, onB] = [open(a.handler), open(b.handler)];
      const { topic } = await subscribe(onA);
      await subscribe(onB);
      await Promise.all([hearing(a.pubsub), hearing(b.pubsub)]);
      await a.handler.connections.broadcastToTopic(String(topic), "one");
      await expect.poll(() => eventsOf(onB)).toEqual([[1, "one"]]);

      outage.set("down");
      outage.cut();
      await expect.poll(() => b.pubsub.state).toBe("degraded");
      for (const text of ["two", "three"])
        await a.handler.connections.broadcastToTopic(String(topic), text);
      await expect.poll(() => eventsOf(onA)).toHaveLength(3);
      outage.set("up");

      await expect
        .poll(() => eventsOf(onB), { timeout: 5_000 })
        .toEqual([
          [1, "one"],
          [2, "two"],
          [3, "three"],
        ]);
      expect(onB.sent.filter((m) => m.type === "resync")).toEqual([]);
    });
  },
);
