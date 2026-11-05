/**
 * Commands for connections across the replicas that share a pub/sub
 * adapter: closing the connections a selector names, or asking them for
 * their credentials again, reaches every replica holding one. A command is
 * checked before anything is done, and sent only when another replica may
 * hold what it names; with a cluster secret, a command no replica signed,
 * one sent again, and one sent long ago are refused, each on one line.
 */
import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONTROL_CHANNEL } from "../src/adapter/cluster-control";
import { createClusterSigner } from "../src/adapter/cluster-signature";
import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { ConfigurationError } from "../src/errors";
import { createMemoryBus, type MemoryBus } from "../src/realtime/memory-bus";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { createFakeSocket } from "./helpers/fake-socket";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";

const handlers: WSHandler[] = [];
let warned: string[] = [];

beforeEach(() => {
  warned = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(format(...args));
  });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  registerSources({ api: { options: { expose: true, groups: {} } } } as never);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

/** Replicas of one application, each a handler on the same bus. */
function replicas(count: number, bus: MemoryBus, config: WSHandlerConfig = {}): WSHandler[] {
  return Array.from({ length: count }, (_, i) => {
    const handler = createWSHandler({
      heartbeatIntervalMs: 60_000,
      pubsub: bus.replica(`replica-${i}`),
      onConnect: ({ auth }) => ({ userId: auth?.userId }),
      onReauth: ({ auth }) => ({ userId: auth?.userId }),
      ...config,
    });
    handlers.push(handler);
    return handler;
  });
}

/** A client of `userId`, admitted by `handler`. */
async function connect(handler: WSHandler, userId: string) {
  const known = new Set(handler.connections.list().map((c) => c.connectionId));
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive({ type: "auth", payload: { auth: { userId } } });
  const added = () => handler.connections.list().find((c) => !known.has(c.connectionId));
  await expect.poll(added).toBeDefined();
  return { socket, connectionId: added()?.connectionId ?? "" };
}

/** What crosses the control channel, as a replica that only listens hears it. */
async function overhear(bus: MemoryBus): Promise<unknown[]> {
  const heard: unknown[] = [];
  await bus.replica("listener").subscribe(CONTROL_CHANNEL, (message) => heard.push(message));
  return heard;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("connections.disconnect across replicas", () => {
  it("closes a connection another replica holds, by its id, with the code and reason given", async () => {
    const [a, b] = replicas(2, createMemoryBus()) as [WSHandler, WSHandler];
    const held = await connect(b, "u1");

    await a.connections.disconnect(held.connectionId, { code: 4001, reason: "Signed out" });

    await expect.poll(() => held.socket.closed).toMatchObject({ code: 4001, reason: "Signed out" });
  });

  it("closes each connection whose metadata matches, on every replica, and no other", async () => {
    const [a, b, c] = replicas(3, createMemoryBus()) as [WSHandler, WSHandler, WSHandler];
    const onA = await connect(a, "u1");
    const onC = await connect(c, "u1");
    const other = await connect(b, "u2");

    await b.connections.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });

    await expect
      .poll(() => [onA.socket.closed?.code, onC.socket.closed?.code])
      .toEqual([4003, 4003]);
    await settled();
    expect(other.socket.closed).toBeUndefined();
  });

  it("sends no command when every connection it names is this replica's", async () => {
    const bus = createMemoryBus();
    const heard = await overhear(bus);
    const [a] = replicas(1, bus) as [WSHandler];
    const mine = await connect(a, "u1");

    await a.connections.disconnect(mine.connectionId);
    await a.connections.disconnect({ meta: { userId: "u1" } });
    await settled();

    expect(mine.socket.closed?.code).toBe(1000);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      cmd: { kind: "disconnect", selector: { meta: { userId: "u1" } } },
    });
  });

  it("rejects, closing and sending nothing, a selector or a code that names nothing a socket can do", async () => {
    const bus = createMemoryBus();
    const heard = await overhear(bus);
    const [a] = replicas(1, bus) as [WSHandler];
    const mine = await connect(a, "u1");

    await expect(a.connections.disconnect({ id: [] })).rejects.toThrow(TypeError);
    await expect(a.connections.disconnect(mine.connectionId, { code: 1006 })).rejects.toThrow(
      TypeError,
    );
    await expect(a.connections.requireAuth(mine.connectionId, { timeoutMs: -1 })).rejects.toThrow(
      TypeError,
    );
    await settled();

    expect(mine.socket.closed).toBeUndefined();
    expect(heard).toEqual([]);
  });
});

describe("connections.requireAuth across replicas", () => {
  it("asks each connection a selector names for its credentials, and closes one that does not send them in time", async () => {
    const [a, b] = replicas(2, createMemoryBus()) as [WSHandler, WSHandler];
    const held = await connect(b, "u1");

    await a.connections.requireAuth({ meta: { userId: "u1" } }, { timeoutMs: 100 });

    await expect.poll(() => held.socket.sent).toContainEqual({ type: "auth_required" });
    await expect.poll(() => held.socket.closed?.code, { timeout: 2_000 }).toBe(4401);
  });
});

describe("connections.list", () => {
  it("lists the connections of this replica a selector names", async () => {
    const [a, b] = replicas(2, createMemoryBus()) as [WSHandler, WSHandler];
    const mine = await connect(a, "u1");
    await connect(b, "u1");
    await connect(a, "u2");

    expect(a.connections.list({ meta: { userId: "u1" } }).map((c) => c.connectionId)).toEqual([
      mine.connectionId,
    ]);
    expect(() => a.connections.list({ meta: {} })).toThrow(TypeError);
  });
});

describe("a cluster with a secret", () => {
  /** A command as the given secret, or none, would sign it; sent from outside the replicas. */
  async function inject(bus: MemoryBus, secret: string | undefined, at = Date.now()) {
    const unsigned = {
      v: 1,
      id: crypto.randomUUID(),
      at,
      cmd: { kind: "disconnect", selector: { meta: { userId: "u1" } }, code: 4001, reason: "x" },
    } as const;
    const message =
      secret === undefined
        ? unsigned
        : { ...unsigned, sig: await createClusterSigner(secret).sign(unsigned) };
    await bus.replica("outsider").publish(CONTROL_CHANNEL, message);
    return message;
  }

  it("acts on a command another replica signed with the same secret", async () => {
    const [a, b] = replicas(2, createMemoryBus(), { cluster: { secret: SECRET } }) as [
      WSHandler,
      WSHandler,
    ];
    const held = await connect(b, "u1");

    await a.connections.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });

    await expect.poll(() => held.socket.closed?.code).toBe(4003);
  });

  it.each([
    ["no replica signed", undefined, "UNSIGNED"],
    ["another secret signed", "another-secret-of-32-bytes-or-more!", "SIGNATURE_INVALID"],
  ])("refuses a command %s, and says so on one line", async (_case, secret, code) => {
    const bus = createMemoryBus();
    const [b] = replicas(1, bus, { cluster: { secret: SECRET } }) as [WSHandler];
    const held = await connect(b, "u1");

    await inject(bus, secret);

    await expect.poll(() => warned.join("\n")).toContain(`cluster command refused code=${code}`);
    expect(held.socket.closed).toBeUndefined();
  });

  it("acts on a command once, though it arrives again", async () => {
    const bus = createMemoryBus();
    const [b] = replicas(1, bus, { cluster: { secret: SECRET } }) as [WSHandler];
    const first = await connect(b, "u1");
    const sent = await inject(bus, SECRET);
    await expect.poll(() => first.socket.closed?.code).toBe(4001);
    const second = await connect(b, "u1");

    await bus.replica("outsider").publish(CONTROL_CHANNEL, sent);

    await expect.poll(() => warned.join("\n")).toContain("cluster command refused code=REPLAYED");
    expect(second.socket.closed).toBeUndefined();
  });

  it("refuses a command sent more than a minute ago", async () => {
    const bus = createMemoryBus();
    const [b] = replicas(1, bus, { cluster: { secret: SECRET } }) as [WSHandler];
    const held = await connect(b, "u1");

    await inject(bus, SECRET, Date.now() - 61_000);

    await expect.poll(() => warned.join("\n")).toContain("cluster command refused code=STALE");
    expect(held.socket.closed).toBeUndefined();
  });

  it("is refused shorter than 32 bytes, when the handler is made", () => {
    expect(() => createWSHandler({ cluster: { secret: "short" } })).toThrow(ConfigurationError);
  });
});
