/**
 * Connection leases in Redis: granted up to a scope's limit, then the
 * oldest given up for a new one or the new one refused, one decision at a
 * time however many replicas ask together; a lease not renewed lapses, one
 * renewed stays, one released frees its place; and handlers counting their
 * users' connections in it evict across replicas.
 *
 * Set REDIS_URL; the suite is skipped when none answers.
 */
import { createWSHandler, type WSHandler } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import type { PubSubAdapter, WebSocketLike } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";

import { createRedisConnectionLeases } from "../src/redis-connection-leases";
import { createRedisPubSub } from "../src/redis-pubsub";
import { REDIS_URL, redisAnswers, redisClients } from "./helpers/redis-clients";
import { type RedisRelay, startRelay } from "./helpers/redis-relay";

const available = await redisAnswers();
const redis = redisClients();
const adapters: PubSubAdapter[] = [];
const handlers: WSHandler[] = [];
const relays: RedisRelay[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 200 })));
  await Promise.all(adapters.splice(0).map((adapter) => adapter.disconnect({ timeoutMs: 500 })));
  await redis.end();
  for (const relay of relays.splice(0)) await relay.close();
});

const evictOldest = { max: 2, onExceed: "evict-oldest" } as const;
const reject = { max: 2, onExceed: "reject" } as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function store(ttlMs?: number) {
  return createRedisConnectionLeases({
    redis: redis.client(),
    prefix: redis.prefix,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });
}

describe.skipIf(!available)("createRedisConnectionLeases", { timeout: 20_000 }, () => {
  it("grants leases up to the limit, then gives up the oldest for each new one", async () => {
    const leases = store();

    expect(await leases.acquire("key:a", "c1", evictOldest)).toEqual({ admitted: true, evict: [] });
    await sleep(2);
    expect(await leases.acquire("key:a", "c2", evictOldest)).toEqual({ admitted: true, evict: [] });
    await sleep(2);
    expect(await leases.acquire("key:a", "c3", evictOldest)).toEqual({
      admitted: true,
      evict: ["c1"],
    });
    expect(await leases.acquire("key:b", "c4", evictOldest)).toEqual({ admitted: true, evict: [] });
  });

  it("refuses a new lease over the limit when the rule says to, and takes one it holds again", async () => {
    const leases = store();
    await leases.acquire("key:a", "c1", reject);
    await leases.acquire("key:a", "c2", reject);

    expect(await leases.acquire("key:a", "c3", reject)).toEqual({ admitted: false });
    expect(await leases.acquire("key:a", "c2", reject)).toEqual({ admitted: true, evict: [] });
  });

  it("decides one at a time: of replicas asking for the last place together, one gets it", async () => {
    const replicas = Array.from({ length: 6 }, () => store());

    const grants = await Promise.all(
      replicas.map((leases, i) =>
        leases.acquire("key:last", `c${i}`, { max: 1, onExceed: "reject" }),
      ),
    );

    expect(grants.filter((grant) => grant.admitted)).toHaveLength(1);
  });

  it("lets a lease lapse unless it is renewed, and keeps one that is", async () => {
    const leases = store(2_000);
    await leases.acquire("key:a", "kept", reject);
    await leases.acquire("key:a", "lapsing", reject);

    await sleep(1_000);
    await leases.renew([{ scope: "key:a", lease: "kept" }]);
    await sleep(1_400);

    expect(await leases.acquire("key:a", "new", reject)).toEqual({ admitted: true, evict: [] });
    expect(await leases.acquire("key:a", "newer", reject)).toEqual({ admitted: false });
  });

  it("frees a place once a lease is released, and renews no lease given up", async () => {
    const leases = store();
    await leases.acquire("key:a", "c1", { max: 1, onExceed: "evict-oldest" });
    await leases.acquire("key:a", "c2", { max: 1, onExceed: "evict-oldest" });

    await leases.renew([{ scope: "key:a", lease: "c1" }]);
    expect(await leases.acquire("key:a", "c3", { max: 2, onExceed: "reject" })).toEqual({
      admitted: true,
      evict: [],
    });
    await leases.release("key:a", "c2");
    expect(await leases.acquire("key:a", "c4", { max: 2, onExceed: "reject" })).toEqual({
      admitted: true,
      evict: [],
    });
  });
});

/** A replica counting its users' connections in Redis, on a pub/sub adapter of its own. */
function replica(): WSHandler {
  const pubsub = createRedisPubSub({
    publisher: redis.client(),
    subscriber: redis.client(),
    prefix: redis.prefix,
  });
  adapters.push(pubsub);
  const handler = createWSHandler({
    pubsub,
    heartbeatIntervalMs: 60_000,
    sources: { api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) },
    onConnect: ({ auth }) => ({ userId: auth?.userId }),
    maxConnectionsPerKey: { key: (meta) => meta.userId as string | undefined, max: 2 },
    connectionLeases: store(),
  });
  handlers.push(handler);
  return handler;
}

/** A client of `userId`, with how it was closed once it is. */
async function connect(handler: WSHandler, userId: string) {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    closed: undefined as number | undefined,
    send: () => undefined,
    close(code?: number) {
      socket.closed ??= code;
      socket.readyState = 3;
      queueMicrotask(() => {
        for (const listener of listeners.get("close") ?? []) listener({ code: code ?? 1005 });
      });
    },
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as (event: unknown) => void]);
    },
  };
  const before = new Set(handler.connections.list().map((c) => c.connectionId));
  handler.handleSocket(
    socket as WebSocketLike,
    new Request("http://localhost/api/ws"),
    "203.0.113.9",
  );
  const auth = JSON.stringify({ type: "auth", payload: { auth: { userId } } });
  for (const listener of listeners.get("message") ?? []) listener({ data: auth });
  await expect
    .poll(() => handler.connections.list().some((c) => !before.has(c.connectionId)), {
      timeout: 5_000,
    })
    .toBe(true);
  return socket;
}

describe.skipIf(!available)(
  "replicas counting their users' connections in Redis",
  { timeout: 20_000 },
  () => {
    it("close a user's oldest connection held by another replica, for a new one", async () => {
      const a = replica();
      const b = replica();
      await expect.poll(() => adapters.every((p) => p.stats().channels.confirmed >= 1)).toBe(true);
      const onA = await connect(a, "u1");
      await sleep(2);
      const onB = await connect(b, "u1");
      await sleep(2);

      const newest = await connect(b, "u1");

      await expect.poll(() => onA.closed, { timeout: 5_000 }).toBe(4429);
      expect([onB.closed, newest.closed]).toEqual([undefined, undefined]);
    });

    it("let a connection in, by the replica's own count, while Redis cannot be reached", async () => {
      const outage = await startRelay(new URL(REDIS_URL));
      relays.push(outage);
      outage.set("down");
      const handler = createWSHandler({
        heartbeatIntervalMs: 60_000,
        sources: { api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) },
        onConnect: ({ auth }) => ({ userId: auth?.userId }),
        maxConnectionsPerKey: { key: (meta) => meta.userId as string | undefined, max: 1 },
        connectionLeases: createRedisConnectionLeases({
          redis: redis.client(outage),
          prefix: redis.prefix,
        }),
      });
      handlers.push(handler);

      const first = await connect(handler, "u1");
      const second = await connect(handler, "u1");

      expect(first.closed).toBe(4429);
      expect(second.closed).toBeUndefined();
    });
  },
);
