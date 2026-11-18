/**
 * The HTTP transport on replicas that share a Redis and no affinity, behind
 * an entry that sends each request to the next replica in turn: the
 * connection lives on the replica that opened it, every request that lands
 * on another goes on to it through Redis, and what a third publishes to
 * its topic reaches it in order, each event once. With the cluster's
 * secret a request anyone published straight to Redis is refused; while a
 * replica cannot reach Redis it says so at once, and carries on once Redis
 * is back.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { randomUUID } from "node:crypto";

import { createWSHandler, type WSHandler } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import type { PubSubAdapter } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPubSub } from "../src/redis-pubsub";
import { REDIS_URL, redisAnswers, redisClients } from "./helpers/redis-clients";
import { type RedisRelay, startRelay } from "./helpers/redis-relay";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";
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

/** A replica on a Redis adapter of its own, with the log; its polls held 300 ms at most. */
function replica(through?: RedisRelay) {
  const pubsub = createRedisPubSub({
    publisher: redis.client(through),
    subscriber: redis.client(through),
    prefix: redis.prefix,
    log: {},
  });
  adapters.push(pubsub);
  const handler = createWSHandler({
    pubsub,
    cluster: { secret: SECRET },
    heartbeatIntervalMs: 60_000,
    http: { holdMs: 300 },
    sources: { api },
  });
  handlers.push(handler);
  return { handler, pubsub };
}

type Event = {
  readonly id: string | undefined;
  readonly event: string | undefined;
  readonly data: string;
};

/** An entry in front of the replicas that sends each request to the next one in turn. */
function roundRobin(replicas: readonly WSHandler[]) {
  let next = 0;
  return async (head: object, frames: readonly object[] = []) => {
    const handler = replicas[next++ % replicas.length] as WSHandler;
    const body = [head, ...frames].map((line) => JSON.stringify(line)).join("\n");
    const request = new Request("http://localhost/api/ws", { method: "POST", body });
    const response = await handler.handleHTTP(request, "203.0.113.9");
    return { status: response.status, events: readEvents(await response.text()) };
  };
}

function readEvents(text: string): Event[] {
  return text
    .split("\n\n")
    .filter((block) => block.includes("data:"))
    .map((block) => {
      const field = (name: string) =>
        block
          .split("\n")
          .find((line) => line.startsWith(`${name}: `))
          ?.slice(name.length + 2);
      return { id: field("id"), event: field("event"), data: field("data") ?? "" };
    });
}

const typeOf = (event: Event): unknown => event.event ?? JSON.parse(event.data).type;

describe.skipIf(!available)(
  "the HTTP transport on replicas sharing a Redis",
  { timeout: 20_000 },
  () => {
    it("carries a connection whose requests land on each replica in turn, its events in order and once", async () => {
      const [a, b, c] = [replica(), replica(), replica()];
      /* As a readiness check holds traffic back: a replica whose Redis is not reached yet answers 503. */
      await expect.poll(() => [a, b, c].every((each) => each.pubsub.state === "ready")).toBe(true);
      const entry = roundRobin([a.handler, b.handler]);
      const opened = await entry({ op: "poll", v: 1 }, [
        { type: "auth", v: 2, id: "a0" },
        { type: "subscribe", id: "s1", topic: "api.room" },
      ]);
      const token = JSON.parse(opened.events[0]?.data ?? "{}").token as string;
      const taken: Event[] = [...opened.events];
      const statuses = [opened.status];
      let ack = 0;
      const poll = async () => {
        ack = Math.max(ack, ...taken.map((event) => Number(event.id ?? 0)));
        const { status, events } = await entry({ op: "poll", token, ack });
        statuses.push(status);
        taken.push(...events.filter((event) => Number(event.id ?? 0) > ack || !event.id));
      };
      while (!taken.some((event) => typeOf(event) === "subscribed")) await poll();
      const subscribed = taken.find((event) => typeOf(event) === "subscribed") as Event;

      for (const text of ["one", "two", "three"]) {
        await c.handler.connections.broadcastToTopic(JSON.parse(subscribed.data).topic, text);
      }
      while (taken.filter((event) => typeOf(event) === "data").length < 3) await poll();

      const data = taken.filter((event) => typeOf(event) === "data").map((e) => JSON.parse(e.data));
      expect(data.map((frame) => [frame.seq, frame.payload])).toEqual([
        [1, "one"],
        [2, "two"],
        [3, "three"],
      ]);
      const ids = taken.flatMap((event) => (event.id === undefined ? [] : [Number(event.id)]));
      expect(ids).toEqual([...new Set(ids)].sort((x, y) => x - y));
      expect(new Set(statuses)).toEqual(new Set([200]));
      expect(b.handler.stats().http?.forwarded).toBeGreaterThan(0);
      expect([a, b].map((each) => each.handler.stats().http?.connections)).toEqual([1, 0]);
    });

    it("refuses a request published straight to Redis, unsigned, on the holder's channel", async () => {
      const [a, b] = [replica(), replica()];
      const entry = roundRobin([a.handler, b.handler]);
      const opened = await entry({ op: "poll", v: 1 }, [{ type: "auth", v: 2, id: "a0" }]);
      const token = JSON.parse(opened.events[0]?.data ?? "{}").token as string;
      const forger = redis.client();
      const request = [{ op: "send", token, seq: 2 }, { type: "ping" }].map((line) =>
        JSON.stringify(line),
      );
      const payload = {
        v: 1,
        kind: "request",
        id: randomUUID(),
        at: Date.now(),
        from: "0".repeat(16),
        wait: 0,
        request: request.join("\n"),
      };
      const envelope = { origin: randomUUID(), payload, timestamp: Date.now() };

      await forger.publish(
        `${redis.prefix}courier:ws:http:${token.slice(0, 16)}`,
        JSON.stringify(envelope),
      );
      const after = await entry({ op: "poll", token, ack: 1 });
      const sent = await entry({ op: "send", token, seq: 2, ack: 1 }, [{ type: "ping" }]);
      const pong = await entry({ op: "poll", token, ack: 1 });

      expect(after.events).toEqual([]);
      expect(sent.status).toBe(204);
      expect(pong.events.map(typeOf)).toEqual(["pong"]);
    });

    it("answers 503 at once while a replica cannot reach Redis, and carries on once it is back", async () => {
      const outage = await startRelay(new URL(REDIS_URL));
      relays.push(outage);
      const [a, b] = [replica(), replica(outage)];
      const [onA, onB] = [roundRobin([a.handler]), roundRobin([b.handler])];
      const opened = await onA({ op: "poll", v: 1 }, [{ type: "auth", v: 2, id: "a0" }]);
      const token = JSON.parse(opened.events[0]?.data ?? "{}").token as string;
      await expect.poll(() => b.pubsub.state).toBe("ready");

      outage.set("down");
      outage.cut();
      await expect.poll(() => b.pubsub.state).toBe("degraded");
      const started = performance.now();
      const refused = await onB({ op: "send", token, seq: 2, ack: 1 }, [{ type: "ping" }]);
      const waited = performance.now() - started;
      outage.set("up");
      await expect.poll(() => b.pubsub.state, { timeout: 5_000 }).toBe("ready");
      const sent = await onB({ op: "send", token, seq: 2, ack: 1 }, [{ type: "ping" }]);

      expect(refused.status).toBe(503);
      expect(waited).toBeLessThan(100);
      expect(sent.status).toBe(204);
    });
  },
);
