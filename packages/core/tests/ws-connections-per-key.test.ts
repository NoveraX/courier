/**
 * A limit on one key's connections — a user's tabs and devices — through a
 * WebSocket handler: over it, the oldest connection of the key is closed
 * with 4409 for the new one, or the new one is refused with 4429 and its
 * onDisconnect run; a connection that closes gives its place back; replicas
 * sharing a lease store count the key's connections together, and evict
 * across each other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { ConfigurationError } from "../src/errors";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { createMemoryConnectionLeases } from "../src/realtime/memory-leases";
import { _resetSourcesForTests, registerSources } from "../src/sources";
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

  it.each([
    ["without onConnect to read keys from", { onConnect: undefined }],
    ["with a max that is no whole number", { maxConnectionsPerKey: { ...perUser(2), max: 1.5 } }],
    ["with a max under 1", { maxConnectionsPerKey: { ...perUser(2), max: 0 } }],
    [
      "with an onExceed of neither kind",
      { maxConnectionsPerKey: { ...perUser(2), onExceed: "drop" } },
    ],
    ["with an empty list of rules", { maxConnectionsPerKey: [] }],
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
