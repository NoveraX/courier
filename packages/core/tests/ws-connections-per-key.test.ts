/**
 * A limit on one key's connections — a user's tabs and devices — through a
 * WebSocket handler: over it, the oldest connection of the key is closed
 * with 4409 for the new one, or the new one is refused with 4429 and its
 * onDisconnect run; a connection that closes gives its place back; replicas
 * sharing a lease store count the key's connections together, and evict
 * across each other. While a connection waits for its place, the commands
 * that name it reach it, and one whose client left takes none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { ConfigurationError } from "../src/errors";
import type { ConnectionLeaseStore, LeaseGrant } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { createMemoryConnectionLeases } from "../src/realtime/memory-leases";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const handlers: WSHandler[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({ api: { options: { expose: true, groups: {} } } } as never);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

const perUser = (max: number, onExceed?: "evict-oldest" | "reject") => ({
  key: (meta: Record<string, unknown>) => meta.userId as string | undefined,
  max,
  ...(onExceed ? { onExceed } : {}),
});

function serve(config: WSHandlerConfig): WSHandler {
  const handler = createWSHandler({
    heartbeatIntervalMs: 60_000,
    onConnect: ({ auth }) => ({ userId: auth?.userId }),
    ...config,
  });
  handlers.push(handler);
  return handler;
}

/** A client of `userId`, once the handler has registered or refused it. */
async function connect(
  handler: WSHandler,
  userId: string,
  address = "203.0.113.7",
): Promise<FakeSocket> {
  const known = new Set(handler.connections.list().map((c) => c.connectionId));
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), address);
  socket.receive(authFrame({ auth: { userId } }));
  const registered = () => handler.connections.list().some((c) => !known.has(c.connectionId));
  await expect.poll(() => registered() || socket.closed !== undefined).toBe(true);
  return socket;
}

/** A lease store whose decisions wait until the test makes them: its own, or the memory store's. */
function heldLeases() {
  const memory = createMemoryConnectionLeases();
  const asked: Array<{ readonly lease: string; decide(grant?: LeaseGrant): void }> = [];
  const store: ConnectionLeaseStore = {
    ttlMs: undefined,
    acquire: (scope, lease, rule) =>
      new Promise((resolve, reject) => {
        asked.push({
          lease,
          decide: (grant) =>
            grant ? resolve(grant) : memory.acquire(scope, lease, rule).then(resolve, reject),
        });
      }),
    renew: (leases) => memory.renew(leases),
    release: (scope, lease) => memory.release(scope, lease),
  };
  return { store, asked };
}

/** A socket of `auth` handed to the handler, which admits it as it can. */
function open(handler: WSHandler, auth: Record<string, unknown>): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive(authFrame({ auth }));
  return socket;
}

describe("maxConnectionsPerKey", () => {
  it("closes the oldest connection of a key over the limit with 4409, for the new one", async () => {
    const handler = serve({ maxConnectionsPerKey: perUser(2) });
    const first = await connect(handler, "u1");
    const second = await connect(handler, "u1");

    const third = await connect(handler, "u1");

    await expect
      .poll(() => first.closed)
      .toMatchObject({ code: 4409, reason: "Replaced by a newer connection" });
    expect(first.sent.at(-1)).toEqual({
      type: "disconnect",
      code: 4409,
      reason: "Replaced by a newer connection",
    });
    expect([second.closed, third.closed]).toEqual([undefined, undefined]);
    await expect.poll(() => handler.stats().connections).toBe(2);
  });

  it("refuses a new connection over the limit with 4429 and a wait when told to, and runs its onDisconnect", async () => {
    const onDisconnect = vi.fn();
    const handler = serve({ maxConnectionsPerKey: perUser(1, "reject"), onDisconnect });
    const first = await connect(handler, "u1");

    const second = await connect(handler, "u1");

    expect(second.closed).toMatchObject({ code: 4429, reason: "Too many connections" });
    expect(second.sent.at(-1)).toMatchObject({ type: "auth_error", retryAfterMs: 10_000 });
    expect(first.closed).toBeUndefined();
    expect(onDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { userId: "u1" }, code: 4429 }),
    );
  });

  it("gives a place back when a connection of the key closes", async () => {
    const handler = serve({ maxConnectionsPerKey: perUser(1, "reject") });
    const first = await connect(handler, "u1");
    first.emit("close", { code: 1000 });
    await expect.poll(() => handler.stats().connections).toBe(0);

    const second = await connect(handler, "u1");

    expect(second.closed).toBeUndefined();
  });

  it("counts a key's connections on every replica sharing the lease store, and evicts across them", async () => {
    const bus = createMemoryBus();
    const connectionLeases = createMemoryConnectionLeases();
    const shared = { maxConnectionsPerKey: perUser(2), connectionLeases };
    const a = serve({ ...shared, pubsub: bus.replica("a") });
    const b = serve({ ...shared, pubsub: bus.replica("b") });
    const onA = await connect(a, "u1");
    const onB = await connect(b, "u1");

    const newest = await connect(b, "u1");

    await expect.poll(() => onA.closed?.code).toBe(4409);
    expect([onB.closed, newest.closed]).toEqual([undefined, undefined]);
  });

  it("limits one address's connections on every replica sharing the store, by the address the handler counts", async () => {
    const bus = createMemoryBus();
    const connectionLeases = createMemoryConnectionLeases();
    const perAddress = {
      key: (_: unknown, { clientIp }: { clientIp: string }) => clientIp,
      max: 2,
      onExceed: "reject" as const,
    };
    const shared = { maxConnectionsPerKey: [perUser(5), perAddress], connectionLeases };
    const a = serve({ ...shared, pubsub: bus.replica("a") });
    const b = serve({ ...shared, pubsub: bus.replica("b") });
    await connect(a, "u1");
    await connect(b, "u2");

    const third = await connect(b, "u3");
    const elsewhere = await connect(b, "u3", "198.51.100.1");

    expect(third.closed).toMatchObject({ code: 4429, reason: "Too many connections" });
    expect(elsewhere.closed).toBeUndefined();
  });

  it("closes a connection waiting for its place when a sign-out names it, never letting it in", async () => {
    const onDisconnect = vi.fn();
    const { store, asked } = heldLeases();
    const handler = serve({
      maxConnectionsPerKey: perUser(5),
      connectionLeases: store,
      onDisconnect,
    });
    const socket = open(handler, { userId: "u1" });
    await expect.poll(() => asked.length).toBe(1);

    await handler.connections.disconnect(
      { meta: { userId: "u1" } },
      { code: 4001, reason: "Signed out" },
    );
    asked[0]?.decide();

    await expect.poll(() => onDisconnect.mock.calls.length).toBe(1);
    expect(socket.closed).toMatchObject({ code: 4001, reason: "Signed out" });
    expect(socket.sent.map((frame) => frame.type)).toEqual(["auth_error"]);
    expect(onDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { userId: "u1" }, code: 4001 }),
    );
    expect(handler.connections.list()).toEqual([]);
  });

  it("asks a connection waiting for its place for its credentials as soon as it is let in", async () => {
    const { store, asked } = heldLeases();
    const handler = serve({ maxConnectionsPerKey: perUser(5), connectionLeases: store });
    const socket = open(handler, { userId: "u1" });
    await expect.poll(() => asked.length).toBe(1);

    await handler.connections.requireAuth({ meta: { userId: "u1" } }, { timeoutMs: 5_000 });
    asked[0]?.decide();

    await expect
      .poll(() => socket.sent.map((frame) => frame.type))
      .toEqual(["auth_ok", "reauth_required"]);
    expect(socket.sent[1]).toEqual({ type: "reauth_required", timeoutMs: 5_000 });
  });

  it("gives no place, and replaces no connection, to one whose client left while onConnect ran", async () => {
    const admitting = Promise.withResolvers<void>();
    const asked = vi.fn();
    const onDisconnect = vi.fn();
    const handler = serve({
      maxConnectionsPerKey: perUser(1),
      onDisconnect,
      onConnect: async ({ auth }) => {
        if (auth?.slow) {
          asked();
          await admitting.promise;
        }
        return { userId: auth?.userId };
      },
    });
    const live = await connect(handler, "u1");
    const leaving = open(handler, { userId: "u1", slow: true });
    await expect.poll(() => asked.mock.calls.length).toBe(1);

    leaving.emit("close", { code: 1001 });
    admitting.resolve();

    await expect.poll(() => onDisconnect.mock.calls.length).toBe(1);
    expect(live.closed).toBeUndefined();
    expect(handler.connections.list()).toHaveLength(1);
  });

  it("closes with 4409 a connection a newer one replaced before it was let in", async () => {
    const ids = new Map<unknown, string>();
    const { store, asked } = heldLeases();
    const handler = serve({
      maxConnectionsPerKey: perUser(1),
      connectionLeases: store,
      onConnect: ({ connectionId, auth }) => {
        ids.set(auth?.tab, connectionId);
        return { userId: auth?.userId };
      },
    });
    const older = open(handler, { userId: "u1", tab: "older" });
    const newer = open(handler, { userId: "u1", tab: "newer" });
    await expect.poll(() => asked.length).toBe(2);
    const leaseOf = (tab: string) => asked.find((ask) => ask.lease === ids.get(tab));

    /* The store took the older one's lease first and gave it up for the newer one, whose grant
       comes back first. */
    leaseOf("newer")?.decide({ admitted: true, evict: [ids.get("older") ?? ""] });
    leaseOf("older")?.decide({ admitted: true, evict: [] });

    await expect.poll(() => older.closed?.code).toBe(4409);
    expect(older.sent.map((frame) => frame.type)).toEqual(["auth_error"]);
    await expect.poll(() => newer.sent[0]?.type).toBe("auth_ok");
    expect(newer.closed).toBeUndefined();
    expect(handler.connections.list().map((c) => c.connectionId)).toEqual([ids.get("newer")]);
  });

  it.each([
    ["without onConnect to read keys from", { onConnect: undefined }],
    ["with a max that is no whole number", { maxConnectionsPerKey: { ...perUser(2), max: 1.5 } }],
    ["with a max under 1", { maxConnectionsPerKey: { ...perUser(2), max: 0 } }],
    [
      "with an onExceed of neither kind",
      { maxConnectionsPerKey: { ...perUser(2), onExceed: "drop" } },
    ],
    ["with an empty list of rules", { maxConnectionsPerKey: [] }],
    [
      "with a store that keeps a lease under a second",
      { connectionLeases: { ...createMemoryConnectionLeases(), ttlMs: 500 } },
    ],
    [
      "with a store whose timeoutMs is no whole number",
      { connectionLeases: { ...createMemoryConnectionLeases(), timeoutMs: 0.5 } },
    ],
  ])("is refused when the handler is made %s", (_case, extra) => {
    expect(() =>
      createWSHandler({
        onConnect: () => ({}),
        maxConnectionsPerKey: perUser(2),
        ...(extra as WSHandlerConfig),
      }),
    ).toThrow(ConfigurationError);
  });
});
