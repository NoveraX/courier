/**
 * Who a connection is, through a WebSocket handler: the credentials it is
 * admitted on, and those it sends again on its open socket. A refusal
 * closes it at once, with why; a hook that does not settle is bounded;
 * credentials taken anew lift the deadline they were asked for by, and
 * subscriptions the renewed identity may not hold end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { sendAuthRequired } from "../src/adapter/ws-reauth";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import { ForbiddenError } from "../src/realtime/errors";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const { channel } = courier();
const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: () => undefined }));
const lobby = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: () => undefined }));

const handlers: WSHandler[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, room, lobby } } } },
  } as Sources);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy()));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

function open(handler: WSHandler, auth: Record<string, unknown>): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
  socket.receive({ type: "auth", payload: { auth } });
  return socket;
}

async function admitted(handler: WSHandler, auth: Record<string, unknown>) {
  const socket = open(handler, auth);
  await expect.poll(() => handler.connections.count).toBe(1);
  const connectionId = handler.connections.list()[0]?.connectionId ?? "";
  return { socket, connectionId };
}

const asUser = ({ auth }: { auth: Record<string, unknown> | undefined }) => ({
  userId: auth?.userId,
});

describe("credentials sent again on an open connection", () => {
  it("close it at once with 4401 when onReauth refuses what sendAuthRequired asked for", async () => {
    const handler = serve({
      onConnect: asUser,
      onReauth: () => {
        throw new Error("token revoked");
      },
    });
    const { socket, connectionId } = await admitted(handler, { userId: "u1" });
    const asked = Date.now();
    sendAuthRequired(handler.connections, connectionId, 4_000);

    socket.receive({ type: "auth", id: "r1", payload: { auth: { token: "revoked" } } });

    /* The wrong behaviour waits for the 4000 ms deadline; half of it is the bound. */
    await expect.poll(() => socket.closed, { timeout: 2_000 }).toBeDefined();
    expect(socket.closed).toMatchObject({ code: 4401, reason: "Credentials rejected" });
    expect((socket.closed?.at ?? Number.POSITIVE_INFINITY) - asked).toBeLessThan(2_000);
  });

  it("close it at once with 4401 when onReauth refuses credentials sent unasked", async () => {
    const handler = serve({
      onConnect: asUser,
      onReauth: () => {
        throw new Error("token revoked");
      },
    });
    const { socket } = await admitted(handler, { userId: "u1" });

    socket.receive({ type: "auth", id: "r2", payload: { auth: { token: "revoked" } } });

    await expect.poll(() => socket.closed?.code).toBe(4401);
  });

  it("close it at once on a handler with no onReauth to check them", async () => {
    const handler = serve({ onConnect: asUser });
    const { socket } = await admitted(handler, { userId: "u1" });

    socket.receive({ type: "auth", id: "r3", payload: { auth: { token: "fresh" } } });

    await expect
      .poll(() => socket.closed)
      .toMatchObject({
        code: 4401,
        reason: "Credentials cannot be renewed on this connection",
      });
  });

  it("are asked for within the handler's authRequiredTimeoutMs when no deadline is named", async () => {
    const handler = serve({ onConnect: asUser, authRequiredTimeoutMs: 150 });
    const { socket, connectionId } = await admitted(handler, { userId: "u1" });
    const asked = Date.now();

    sendAuthRequired(handler.connections, connectionId);

    expect(socket.sent).toContainEqual({ type: "auth_required" });
    await expect.poll(() => socket.closed?.code, { timeout: 2_000 }).toBe(4401);
    expect((socket.closed?.at ?? 0) - asked).toBeGreaterThanOrEqual(140);
  });

  it("close it when onReauth does not settle within the hook's deadline", async () => {
    const handler = serve({
      onConnect: asUser,
      middlewareTimeoutMs: 100,
      onReauth: () => new Promise<never>(() => undefined),
    });
    const { socket } = await admitted(handler, { userId: "u1" });

    socket.receive({ type: "auth", id: "r4", payload: { auth: { token: "slow" } } });

    await expect
      .poll(() => socket.closed, { timeout: 2_000 })
      .toMatchObject({
        code: 4401,
        reason: "Credentials could not be checked in time",
      });
  });

  it("are taken by onReauth: acknowledged by their id, and the deadline lifted", async () => {
    const handler = serve({
      onConnect: asUser,
      onReauth: ({ auth }) => ({ userId: auth?.userId }),
    });
    const { socket, connectionId } = await admitted(handler, { userId: "u1" });
    sendAuthRequired(handler.connections, connectionId, 200);

    socket.receive({ type: "auth", id: "r5", payload: { auth: { userId: "u1" } } });

    await expect.poll(() => socket.sent).toContainEqual({ type: "auth", id: "r5" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(socket.closed).toBeUndefined();
  });

  it("end each subscription the renewed identity may not hold, with 4403, and keep the rest", async () => {
    const handler = serve({
      onConnect: asUser,
      onReauth: ({ auth }) => ({ userId: auth?.userId }),
      authorize: ({ meta, method }) => method === "lobby" || meta.userId === "u1",
    });
    const { socket } = await admitted(handler, { userId: "u1" });
    const roomTopic = qualifyTopic("api.live.room", {});
    const lobbyTopic = qualifyTopic("api.live.lobby", {});
    socket.receive({ type: "subscribe", id: "s1", topic: roomTopic });
    socket.receive({ type: "subscribe", id: "s2", topic: lobbyTopic });
    await expect.poll(() => socket.sent.filter((m) => m.type === "subscribed")).toHaveLength(2);

    socket.receive({ type: "auth", id: "r6", payload: { auth: { userId: "u2" } } });

    await expect
      .poll(() => socket.sent.find((m) => m.type === "complete"))
      .toMatchObject({ topic: roomTopic, error: { code: 4403 } });
    expect(socket.sent.filter((m) => m.type === "complete")).toHaveLength(1);
    expect(socket.closed).toBeUndefined();
  });
});

describe("the credentials a connection is admitted on", () => {
  it("close it with a refusal's own code and message, when onConnect throws a RealtimeError", async () => {
    const handler = serve({
      onConnect: () => {
        throw new ForbiddenError("Banned");
      },
    });

    const socket = open(handler, { userId: "u1" });

    await expect.poll(() => socket.closed).toMatchObject({ code: 4403, reason: "Banned" });
  });

  it("close it with 4401 for any other error, its text kept from the client", async () => {
    const handler = serve({
      onConnect: () => {
        throw new Error("db password wrong");
      },
    });

    const socket = open(handler, { userId: "u1" });

    await expect
      .poll(() => socket.closed)
      .toMatchObject({
        code: 4401,
        reason: "Connection rejected",
      });
  });

  it("close it as the server's fault when onConnect does not settle within the hook's deadline", async () => {
    const handler = serve({
      middlewareTimeoutMs: 100,
      onConnect: () => new Promise<never>(() => undefined),
    });

    const socket = open(handler, { userId: "u1" });

    await expect
      .poll(() => socket.closed, { timeout: 2_000 })
      .toMatchObject({
        code: 1011,
        reason: "Connection could not be admitted in time",
      });
    expect(handler.connections.count).toBe(0);
  });
});

describe("a connection the application disconnects", () => {
  it("is closed with the application's code and reason", async () => {
    const handler = serve({ onConnect: asUser });
    const { socket, connectionId } = await admitted(handler, { userId: "u1" });

    handler.connections.disconnect(connectionId, 4001, "Signed out");

    expect(socket.closed).toMatchObject({ code: 4001, reason: "Signed out" });
  });

  it("is not closed with a code no socket can send, and the caller hears why", async () => {
    const handler = serve({ onConnect: asUser });
    const { socket, connectionId } = await admitted(handler, { userId: "u1" });

    expect(() => handler.connections.disconnect(connectionId, 1006, "x")).toThrow(TypeError);
    expect(socket.closed).toBeUndefined();
  });
});
