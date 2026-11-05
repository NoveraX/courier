/**
 * What a WebSocket handler logs when one of the hooks that refuse by
 * throwing refuses: `onConnect`, `onReauth`, `authorize`,
 * `authorizeMessage` and a subscription's middleware. Each refusal is one
 * line with its code, the thrown error's name and message and the
 * connection; never a stack, and never the client's address itself.
 */
import { format } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import { defineMiddleware } from "../src/middleware";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { authFrame, createFakeSocket, type FakeSocket } from "./helpers/fake-socket";

const { channel } = courier();
const ADDRESS = "203.0.113.7";
const room = channel
  .send<string>()
  .response<string>()
  .implement(() => ({ onMessage: () => undefined }));

let warned: string[] = [];
const handlers: WSHandler[] = [];

beforeEach(() => {
  warned = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(format(...args));
  });
  vi.stubEnv("NO_COLOR", "1");
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy()));
  _resetSourcesForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function serve(config: WSHandlerConfig, middleware: unknown[] = []): WSHandler {
  registerSources({
    api: { options: { expose: true, middleware, groups: { live: { options: {}, room } } } },
  } as Sources);
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

function open(handler: WSHandler, auth: Record<string, unknown>): FakeSocket {
  const socket = createFakeSocket();
  handler.handleSocket(socket, new Request("http://localhost/api/ws"), ADDRESS);
  socket.receive(authFrame({ auth }));
  return socket;
}

async function admitted(handler: WSHandler, auth: Record<string, unknown>): Promise<FakeSocket> {
  const socket = open(handler, auth);
  await expect.poll(() => handler.connections.count).toBe(1);
  return socket;
}

/** The one line a refusal printed, checked to be one line with no stack. */
async function refusalLine(event: string): Promise<string> {
  await expect.poll(() => warned.some((line) => line.includes(event))).toBe(true);
  const lines = warned.filter((line) => line.includes(event));
  expect(lines).toHaveLength(1);
  const [line = ""] = lines;
  expect(line).not.toContain("\n");
  expect(line).not.toMatch(/\bat .+:\d+:\d+/);
  return line;
}

const byUser = ({ auth }: { auth: Record<string, unknown> | undefined }) => ({
  userId: auth?.userId,
});

describe("a WebSocket handler's refusals in the log", () => {
  it("logs a connection onConnect refuses on one line, naming the address by a tag only", async () => {
    const handler = serve({
      onConnect: () => {
        throw new Error("invalid token");
      },
    });

    const socket = open(handler, { token: "bad" });

    await expect.poll(() => socket.closed?.code).toBe(4401);
    const line = await refusalLine("connection refused");
    expect(line).toMatch(
      /connection refused code=4401 reason="Error: invalid token" conn=\S+ addr=[0-9a-f]{8}$/,
    );
    expect(line).not.toContain(ADDRESS);
  });

  it("logs credentials onReauth refuses on one line", async () => {
    const handler = serve({
      onConnect: byUser,
      onReauth: () => {
        throw new Error("token revoked");
      },
    });
    const socket = await admitted(handler, { userId: "u1" });

    socket.receive({ type: "auth", id: "r1", payload: { auth: { token: "revoked" } } });

    const line = await refusalLine("credentials refused");
    expect(line).toMatch(
      /credentials refused code=4401 reason="Error: token revoked" conn=\S+ addr=[0-9a-f]{8}$/,
    );
  });

  it("logs credentials sent again to a handler with no onReauth on one line, saying why", async () => {
    const handler = serve({ onConnect: byUser });
    const socket = await admitted(handler, { userId: "u1" });

    socket.receive({ type: "auth", id: "r1", payload: { auth: { token: "fresh" } } });

    const line = await refusalLine("credentials refused");
    expect(line).toMatch(
      /credentials refused code=4401 reason="no onReauth checks them" conn=\S+ addr=[0-9a-f]{8}$/,
    );
  });

  it("logs a subscription authorize refuses by throwing on one line, naming the endpoint only", async () => {
    const handler = serve({
      onConnect: byUser,
      authorize: () => {
        throw new Error("not a member");
      },
    });
    const socket = await admitted(handler, { userId: "u1" });

    socket.receive({
      type: "subscribe",
      id: "s1",
      topic: qualifyTopic("api.live.room", { room: "secret-room" }),
      payload: { room: "secret-room" },
    });

    const line = await refusalLine("subscription refused");
    expect(line).toMatch(
      /subscription refused code=4403 reason="Error: not a member" conn=\S+ endpoint=\[api\]\[live\]\[room\]$/,
    );
    expect(line).not.toContain("secret-room");
  });

  it("logs a subscription its middleware refuses on one line", async () => {
    const gate = defineMiddleware("gate", "before", async () => {
      throw new Error("no session");
    });
    const handler = serve({ onConnect: byUser }, [gate]);
    const socket = await admitted(handler, { userId: "u1" });

    socket.receive({ type: "subscribe", id: "s1", topic: qualifyTopic("api.live.room", {}) });

    const line = await refusalLine("subscription refused");
    expect(line).toMatch(
      /subscription refused code=5000 reason="Error: no session" conn=\S+ endpoint=\[api\]\[live\]\[room\]$/,
    );
  });

  it("logs a message authorizeMessage refuses by throwing on one line", async () => {
    const handler = serve({
      onConnect: byUser,
      authorizeMessage: () => {
        throw new Error("muted");
      },
    });
    const socket = await admitted(handler, { userId: "u1" });
    const topic = qualifyTopic("api.live.room", {});
    socket.receive({ type: "subscribe", id: "s1", topic });
    await expect.poll(() => socket.sent.some((msg) => msg.type === "subscribed")).toBe(true);

    socket.receive({ type: "message", id: "m1", topic, payload: "hello" });

    const line = await refusalLine("message refused");
    expect(line).toMatch(
      /message refused code=4403 reason="Error: muted" conn=\S+ endpoint=\[api\]\[live\]\[room\]$/,
    );
  });
});
