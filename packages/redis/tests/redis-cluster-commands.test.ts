/**
 * Commands for connections between replicas that share a Redis: closing a
 * user's connections, or asking them for their credentials again, reaches
 * the replica that holds them through Redis itself. With a cluster secret,
 * a command anyone published straight to Redis is refused.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { randomUUID } from "node:crypto";

import { createWSHandler, type WSHandler } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import type { PubSubAdapter, WebSocketLike } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisPubSub } from "../src/redis-pubsub";
import { redisAnswers, redisClients } from "./helpers/redis-clients";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";
/* The channel the handlers send commands on, under the adapter's prefix. */
const CONTROL_CHANNEL = "courier:ws:control";

const available = await redisAnswers();
const redis = redisClients();
const adapters: PubSubAdapter[] = [];
const handlers: WSHandler[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 200 })));
  await Promise.all(adapters.splice(0).map((adapter) => adapter.disconnect({ timeoutMs: 500 })));
  await redis.end();
});

/** A replica: a handler on an adapter of clients of its own, listening once Redis confirms it. */
async function replica(secret?: string): Promise<WSHandler> {
  const adapter = createRedisPubSub({
    publisher: redis.client(),
    subscriber: redis.client(),
    prefix: redis.prefix,
  });
  adapters.push(adapter);
  const handler = createWSHandler({
    pubsub: adapter,
    heartbeatIntervalMs: 60_000,
    sources: { api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) },
    onConnect: ({ auth }) => ({ userId: auth?.userId }),
    ...(secret === undefined ? {} : { cluster: { secret } }),
  });
  handlers.push(handler);
  await expect.poll(() => adapter.stats().channels.confirmed, { timeout: 5_000 }).toBe(1);
  return handler;
}

/** A client of `userId` on `handler`: how it was closed, once it is. */
async function connect(handler: WSHandler, userId: string) {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    closed: undefined as { code: number | undefined; reason: string | undefined } | undefined,
    sent: [] as unknown[],
    send(data: string) {
      socket.sent.push(JSON.parse(data));
    },
    close(code?: number, reason?: string) {
      socket.closed ??= { code, reason };
      socket.readyState = 3;
      queueMicrotask(() => {
        for (const listener of listeners.get("close") ?? []) listener({ code: code ?? 1005 });
      });
    },
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as (event: unknown) => void]);
    },
  };
  const before = handler.connections.count;
  handler.handleSocket(
    socket as WebSocketLike,
    new Request("http://localhost/api/ws"),
    "203.0.113.9",
  );
  const auth = JSON.stringify({ type: "auth", payload: { auth: { userId } } });
  for (const listener of listeners.get("message") ?? []) listener({ data: auth });
  await expect.poll(() => handler.connections.count).toBe(before + 1);
  return socket;
}

describe.skipIf(!available)(
  "commands between replicas sharing a Redis",
  { timeout: 20_000 },
  () => {
    it("close a user's connection held by another replica, through Redis", async () => {
      const a = await replica();
      const b = await replica();
      const held = await connect(b, "u1");
      const other = await connect(b, "u2");

      await a.connections.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });

      await expect
        .poll(() => held.closed, { timeout: 5_000 })
        .toEqual({ code: 4003, reason: "Banned" });
      expect(other.closed).toBeUndefined();
    });

    it("ask a user's connection on another replica for its credentials again, through Redis", async () => {
      const a = await replica();
      const b = await replica();
      const held = await connect(b, "u1");

      await a.connections.requireAuth({ meta: { userId: "u1" } }, { timeoutMs: 60_000 });

      await expect
        .poll(() => held.sent, { timeout: 5_000 })
        .toContainEqual({ type: "auth_required" });
    });

    it("are refused, with a cluster secret, when published straight to Redis, and taken when a replica signed them", async () => {
      const a = await replica(SECRET);
      const b = await replica(SECRET);
      const held = await connect(b, "u1");
      const forged = {
        v: 1,
        id: randomUUID(),
        at: Date.now(),
        cmd: { kind: "disconnect", selector: { meta: { userId: "u1" } }, code: 4001, reason: "x" },
      };
      const envelope = { origin: "outsider", payload: forged, timestamp: Date.now() };

      await redis.client().publish(redis.prefix + CONTROL_CHANNEL, JSON.stringify(envelope));
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(held.closed).toBeUndefined();

      await a.connections.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });
      await expect.poll(() => held.closed?.code, { timeout: 5_000 }).toBe(4003);
    });
  },
);
