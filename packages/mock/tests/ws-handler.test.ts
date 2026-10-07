/**
 * Real HTTP-upgrade tests for the mock server WS handler.
 *
 * These tests boot a real `createMockServer` on an ephemeral port, connect
 * with the `ws` package as a client, and exchange Courier WS protocol frames.
 * They cover the following lifecycle invariants:
 * - duration recording in history
 * - single onLeave invocation per subscription
 * - subscriptions taken again, and several at once, on one socket
 * - a subscription ended by a `complete` frame on onJoin / channelFn failure,
 *   the socket kept for the next
 * - real broadcast fan-out across connections
 * - origin allowlist enforcement
 * - subscribe-before-message ordering guard
 * - message size limits via maxPayload
 */

import { decodeMessage, encodeMessage, type WSMessage } from "@noverax/courier/internal";
import { ForbiddenError } from "@noverax/courier/realtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import {
  createMockServer,
  type MockServer,
  type MockServerOptions,
} from "../src/server/create-mock-server";
import type { PrefixMapping } from "../src/server/prefix-route-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const chatMappings: PrefixMapping[] = [
  {
    prefix: "/chat",
    group: "chat",
    methods: ["room"],
    endpoints: [{ name: "room", operation: "custom", path: "", transport: "ws", isChannel: true }],
  },
];

async function bootServer(extra?: Partial<MockServerOptions>): Promise<{
  server: MockServer;
  url: string;
}> {
  const server = createMockServer({
    port: 0,
    log: false,
    admin: false,
    mappings: chatMappings,
    ...extra,
  });
  const info = await server.start();
  return { server, url: info.url };
}

function wsUrlFor(httpUrl: string, path: string): string {
  return httpUrl.replace(/^http/, "ws") + path;
}

/** Wait for the next message frame from a client socket */
function waitForFrame(ws: WebSocket): Promise<WSMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: Buffer | string) => {
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
      try {
        resolve(decodeMessage(raw.toString()));
      } catch (err) {
        reject(err);
      }
    };
    const onClose = (code: number, reason: Buffer) => {
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(new Error(`socket closed before frame: ${code} ${reason.toString()}`));
    };
    const onError = (err: Error) => {
      ws.off("message", onMessage);
      ws.off("close", onClose);
      reject(err);
    };
    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

/**
 * Every frame the client receives, read one at a time in order. Frames that
 * arrive together are kept rather than missed by a listener added a moment
 * too late, as `waitForFrame` would miss them.
 */
function frameQueue(ws: WebSocket): () => Promise<WSMessage> {
  const arrived: WSMessage[] = [];
  const waiting: Array<(frame: WSMessage) => void> = [];
  ws.on("message", (raw: Buffer | string) => {
    const frame = decodeMessage(raw.toString());
    const waiter = waiting.shift();
    if (waiter) waiter(frame);
    else arrived.push(frame);
  });
  return () => {
    const frame = arrived.shift();
    if (frame) return Promise.resolve(frame);
    return new Promise((resolve) => waiting.push(resolve));
  };
}

/** Wait for the socket to enter OPEN state */
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === ws.OPEN) return resolve();
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

/** Wait for socket close, returning code + reason */
function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    if (ws.readyState === ws.CLOSED) return resolve({ code: 1000, reason: "" });
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

function send(ws: WebSocket, msg: WSMessage): void {
  ws.send(encodeMessage(msg));
}

// Wait one event-loop tick — gives the server time to process async handlers
const tick = () => new Promise<void>((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mock ws-handler — real HTTP upgrade", () => {
  let server: MockServer;
  let baseUrl: string;

  beforeEach(async () => {
    const booted = await bootServer();
    server = booted.server;
    baseUrl = booted.url;
  });

  afterEach(async () => {
    await server.stop();
  });

  it("completes subscribe → onJoin → unsubscribe → onLeave, and keeps the socket open", async () => {
    const events: string[] = [];
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        events.push("join");
      },
      onMessage: () => {
        events.push("message");
      },
      onLeave: () => {
        events.push("leave");
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    const subscribed = await waitForFrame(ws);
    expect(subscribed.type).toBe("subscribed");
    await tick();
    expect(events).toContain("join");

    send(ws, { type: "unsubscribe", topic: "chat.room", id: "u1" });
    const unsubFrame = await waitForFrame(ws);
    expect(unsubFrame).toMatchObject({ type: "unsubscribed", id: "u1", topic: "chat.room" });

    expect(events).toEqual(["join", "leave"]);
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
    await waitForClose(ws);
  });

  it("takes a subscription to the same topic again on the socket, as a component mounted anew makes one", async () => {
    const events: string[] = [];
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        events.push("join");
      },
      onMessage(ctx, message) {
        ctx.send({ echo: message });
      },
      onLeave: () => {
        events.push("leave");
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const next = frameQueue(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await next();
    send(ws, { type: "unsubscribe", topic: "chat.room", id: "u1" });
    send(ws, { type: "subscribe", topic: "chat.room", id: "s2" });

    expect(await next()).toMatchObject({ type: "unsubscribed", id: "u1" });
    expect(await next()).toMatchObject({ type: "subscribed", id: "s2" });
    send(ws, { type: "message", topic: "chat.room", payload: "hello" });
    expect(await next()).toMatchObject({ type: "data", payload: { echo: "hello" } });
    expect(events).toEqual(["join", "leave", "join"]);
    ws.close();
    await waitForClose(ws);
  });

  it("lets a subscription's onLeave finish before the next one to its topic joins", async () => {
    const events: string[] = [];
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        events.push("join");
      },
      onMessage: () => {},
      onLeave: async () => {
        events.push("leave starts");
        await new Promise((r) => setTimeout(r, 30));
        events.push("leave ends");
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const next = frameQueue(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await next();
    send(ws, { type: "unsubscribe", topic: "chat.room", id: "u1" });
    send(ws, { type: "subscribe", topic: "chat.room", id: "s2" });
    await next();
    await next();

    expect(events).toEqual(["join", "leave starts", "leave ends", "join"]);
    ws.close();
    await waitForClose(ws);
  });

  it("serves two subscriptions of the channel on one socket, each with the variables it sent", async () => {
    server.mock("chat", "room").channel(() => ({
      onMessage(ctx, message) {
        ctx.send({ room: (ctx.variables as { room: string }).room, echo: message });
      },
    }));
    const roomA = 'chat.room#{"room":"a"}';
    const roomB = 'chat.room#{"room":"b"}';

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const next = frameQueue(ws);
    send(ws, { type: "subscribe", topic: roomA, id: "s1", payload: { room: "a" } });
    expect(await next()).toMatchObject({ type: "subscribed", topic: roomA });
    send(ws, { type: "subscribe", topic: roomB, id: "s2", payload: { room: "b" } });
    expect(await next()).toMatchObject({ type: "subscribed", topic: roomB });
    send(ws, { type: "unsubscribe", topic: roomA, id: "u1" });
    await next();
    send(ws, { type: "message", topic: roomB, payload: "hi" });

    expect(await next()).toMatchObject({
      type: "data",
      topic: roomB,
      payload: { room: "b", echo: "hi" },
    });
    ws.close();
    await waitForClose(ws);
  });

  it("sends nothing a subscription's handlers try to send once it has ended", async () => {
    server.mock("chat", "room").channel(() => ({
      onJoin(ctx) {
        setTimeout(() => ctx.send({ late: true }), 30);
      },
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);
    const frames: WSMessage[] = [];
    ws.on("message", (raw: Buffer | string) => frames.push(decodeMessage(raw.toString())));
    send(ws, { type: "unsubscribe", topic: "chat.room", id: "u1" });
    await new Promise((r) => setTimeout(r, 80));

    expect(frames.map((frame) => frame.type)).toEqual(["unsubscribed"]);
    ws.close();
    await waitForClose(ws);
  });

  it("calls onLeave exactly once when client closes abruptly", async () => {
    let leaveCount = 0;
    server.mock("chat", "room").channel(() => ({
      onMessage: () => {},
      onLeave: () => {
        leaveCount++;
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);
    // Allow the server's onJoin path to register the connection
    await new Promise((r) => setTimeout(r, 20));

    ws.close();
    await waitForClose(ws);
    // Server-side close handler runs after the client observes close
    await new Promise((r) => setTimeout(r, 30));

    expect(leaveCount).toBe(1);
  });

  it("tells the request hooks, which Studio's mock logs hear, of each subscription as it opens and ends", async () => {
    server.mock("chat", "room").channel(() => ({ onMessage: () => {} }));
    const started = vi.fn();
    const ended = vi.fn();
    server.requestHooks.onStart = started;
    server.requestHooks.onEnd = ended;

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);
    ws.close();
    await waitForClose(ws);
    await new Promise((r) => setTimeout(r, 30));

    expect(started).toHaveBeenCalledWith(
      expect.any(String),
      "GET",
      "/chat/room",
      "chat",
      "room",
      {},
      expect.objectContaining({ upgrade: "websocket" }),
    );
    expect(ended).toHaveBeenCalledWith(
      started.mock.calls[0]?.[0],
      101,
      undefined,
      expect.any(Number),
      0,
      "Started",
    );
  });

  it("records non-zero duration in history after connection closes", async () => {
    server.mock("chat", "room").channel(() => ({ onMessage: () => {} }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);

    // Hold the connection open briefly so duration is measurably > 0
    await new Promise((r) => setTimeout(r, 25));

    ws.close();
    await waitForClose(ws);
    // Server-side close handler runs asynchronously after the client observes
    // close — give it time to update the history entry
    await new Promise((r) => setTimeout(r, 30));

    const entry = server.history.find((h) => h.channel && h.method === "room");
    expect(entry).toBeDefined();
    expect(entry?.duration).toBeGreaterThan(0);
  });

  it("forwards onMessage to handler and lets it send a response", async () => {
    server.mock("chat", "room").channel(() => ({
      onMessage(ctx, msg) {
        const incoming = msg as { text: string };
        ctx.send({ echo: incoming.text });
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);

    send(ws, { type: "message", topic: "chat.room", payload: { text: "hi" } });
    const dataFrame = await waitForFrame(ws);
    expect(dataFrame.type).toBe("data");
    expect((dataFrame as { payload: unknown }).payload).toEqual({ echo: "hi" });

    ws.close();
    await waitForClose(ws);
  });

  it("rejects message frames sent before subscribe with an error frame", async () => {
    server.mock("chat", "room").channel(() => ({ onMessage: () => {} }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "message", topic: "chat.room", payload: { text: "early" } });

    const frame = await waitForFrame(ws);
    expect(frame).toMatchObject({ type: "error", topic: "chat.room", error: { code: 4404 } });

    ws.close();
    await waitForClose(ws);
  });

  it("logs a throwing onJoin with the error itself, stack and all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        throw refused;
      },
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);

    const line = warn.mock.calls.find((call) => String(call[1]).includes("onJoin threw"));
    expect(line?.at(-1)).toBe(refused);
    warn.mockRestore();
    ws.close();
    await waitForClose(ws);
  });

  it("ends the subscription when onJoin throws, and keeps the socket for the next", async () => {
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    expect(await waitForFrame(ws)).toEqual({
      type: "complete",
      topic: "chat.room",
      id: "s1",
      error: { code: 5000, message: "Subscription failed" },
    });
    await tick();
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
    await waitForClose(ws);
  });

  it("passes the RealtimeError onJoin threw to the client", async () => {
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        throw new ForbiddenError("Not a member of this room");
      },
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    const frame = await waitForFrame(ws);
    expect(frame.type).toBe("complete");
    expect(frame.error).toEqual({ code: 4403, message: "Not a member of this room" });
    ws.close();
    await waitForClose(ws);
  });

  it("refuses the subscription when the channelFn factory throws, and keeps the socket", async () => {
    server.mock("chat", "room").channel(() => {
      throw new Error("factory exploded");
    });

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    expect(await waitForFrame(ws)).toEqual({
      type: "complete",
      topic: "chat.room",
      id: "s1",
      error: { code: 5000, message: "Subscription failed" },
    });
    await tick();
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
    await waitForClose(ws);
  });

  it("reports a failed onMessage on the channel's topic, and the channel goes on", async () => {
    server.mock("chat", "room").channel(() => ({
      onMessage: (ctx: { send(data: unknown): void }, message: unknown) => {
        if ((message as { text: string }).text === "boom") throw new Error("handler bug");
        ctx.send({ echo: message });
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);
    send(ws, { type: "message", topic: "chat.room", payload: { text: "boom" } });

    const refused = await waitForFrame(ws);
    expect(refused).toMatchObject({
      type: "error",
      topic: "chat.room",
      error: { code: 5000, message: "Handler error" },
    });
    send(ws, { type: "message", topic: "chat.room", payload: { text: "fine" } });
    expect(await waitForFrame(ws)).toMatchObject({
      type: "data",
      payload: { echo: { text: "fine" } },
    });
    ws.close();
    await waitForClose(ws);
  });

  it("ends the subscription with the reason a handler gave when it closes the channel", async () => {
    let left = 0;
    server.mock("chat", "room").channel(() => ({
      onJoin: (ctx: { close(code?: number, reason?: string): void }) => ctx.close(4001, "kicked"),
      onMessage: () => {},
      onLeave: () => {
        left++;
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const frames: WSMessage[] = [];
    ws.on("message", (raw: Buffer | string) => frames.push(decodeMessage(raw.toString())));
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await new Promise((r) => setTimeout(r, 40));

    expect(frames).toEqual([
      { type: "complete", topic: "chat.room", error: { code: 4001, message: "kicked" } },
    ]);
    expect(left).toBe(1);
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
    await waitForClose(ws);
  });

  it("replaces the subscription a second subscribe to its topic asks for, as a Courier server does", async () => {
    let joinCount = 0;
    let leaveCount = 0;
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        joinCount++;
      },
      onMessage: () => {},
      onLeave: () => {
        leaveCount++;
      },
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const next = frameQueue(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await next();
    send(ws, { type: "subscribe", topic: "chat.room", id: "s2" });

    expect(await next()).toMatchObject({ type: "subscribed", id: "s2" });
    expect(joinCount).toBe(2);
    expect(leaveCount).toBe(1);

    ws.close();
    await waitForClose(ws);
  });

  it("returns 404 for paths not matched by any prefix mapping", async () => {
    const ws = new WebSocket(wsUrlFor(baseUrl, "/not-a-route"));
    const result = await new Promise<{ rejected: boolean; status?: number | undefined }>(
      (resolve) => {
        ws.on("unexpected-response", (_req, res) =>
          resolve({ rejected: true, status: res.statusCode }),
        );
        ws.on("error", () => resolve({ rejected: true }));
        ws.on("open", () => resolve({ rejected: false }));
      },
    );
    expect(result.rejected).toBe(true);
    if (result.status !== undefined) expect(result.status).toBe(404);
    ws.close();
  });
});

// ---------------------------------------------------------------------------
// Real broadcast fan-out
// ---------------------------------------------------------------------------

describe("mock ws-handler — real broadcast", () => {
  let server: MockServer;
  let baseUrl: string;

  beforeEach(async () => {
    const booted = await bootServer();
    server = booted.server;
    baseUrl = booted.url;
  });

  afterEach(async () => {
    await server.stop();
  });

  it("fans out broadcast() to other connections on the same topic", async () => {
    server.mock("chat", "room").channel(() => ({
      onMessage(ctx, msg) {
        ctx.broadcast(ctx.topic, msg);
      },
    }));

    const a = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    const b = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await Promise.all([waitForOpen(a), waitForOpen(b)]);

    send(a, { type: "subscribe", topic: "chat.room", id: "sa" });
    send(b, { type: "subscribe", topic: "chat.room", id: "sb" });
    await waitForFrame(a);
    await waitForFrame(b);
    // Allow onJoin to complete and registry to register both
    await tick();

    // a sends a message; b should receive it via broadcast, but a should NOT
    let aReceivedAfterSend = false;
    a.on("message", (raw: Buffer | string) => {
      const msg = decodeMessage(raw.toString());
      if (msg.type === "data") aReceivedAfterSend = true;
    });

    send(a, { type: "message", topic: "chat.room", payload: { text: "hello" } });
    const bFrame = await waitForFrame(b);
    expect(bFrame.type).toBe("data");
    expect((bFrame as { payload: unknown }).payload).toEqual({ text: "hello" });
    await tick();
    expect(aReceivedAfterSend).toBe(false);

    a.close();
    b.close();
    await Promise.all([waitForClose(a), waitForClose(b)]);
  });

  it("answers on the topic its variables key, renaming one the client keyed otherwise", async () => {
    // A Courier server derives a subscription's key from the variables it
    // validated, not from the topic the client sent: one caller cannot hear
    // what another's variables subscribe to by naming their key.
    server.mock("chat", "room").channel(() => ({
      onJoin(ctx) {
        ctx.send({ greeting: "hello", topic: ctx.topic });
      },
      onMessage(ctx, msg) {
        const incoming = msg as { text: string };
        ctx.send({ echo: incoming.text });
      },
    }));
    const asked = "api.chat.room#forged";
    const served = 'api.chat.room#{"room":"r1"}';

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const next = frameQueue(ws);
    send(ws, { type: "subscribe", topic: asked, id: "s1", payload: { room: "r1" } });

    expect(await next()).toMatchObject({
      type: "renamed",
      id: "s1",
      topic: asked,
      payload: served,
    });
    expect(await next()).toMatchObject({ type: "data", topic: served, payload: { topic: served } });
    expect(await next()).toMatchObject({ type: "subscribed", id: "s1", topic: served });
    send(ws, { type: "message", topic: served, payload: { text: "hi" } });
    expect(await next()).toMatchObject({ type: "data", topic: served, payload: { echo: "hi" } });

    ws.close();
    await waitForClose(ws);
  });

  it("keeps the topic a Courier client sends, its key the variables' own", async () => {
    server.mock("chat", "room").channel(() => ({
      onJoin(ctx) {
        ctx.send({ topic: ctx.topic });
      },
      onMessage: () => {},
    }));
    const topic = 'api.chat.room#{"room":"r1"}';

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const next = frameQueue(ws);
    send(ws, { type: "subscribe", topic, id: "s1", payload: { room: "r1" } });

    expect(await next()).toMatchObject({ type: "data", topic, payload: { topic } });
    expect(await next()).toMatchObject({ type: "subscribed", id: "s1", topic });
    ws.close();
    await waitForClose(ws);
  });
});

// ---------------------------------------------------------------------------
// Origin allowlist
// ---------------------------------------------------------------------------

describe("mock ws-handler — origin allowlist", () => {
  let server: MockServer;
  let baseUrl: string;

  beforeEach(async () => {
    const booted = await bootServer({ ws: { allowedOrigins: ["https://allowed.example"] } });
    server = booted.server;
    baseUrl = booted.url;
    server.mock("chat", "room").channel(() => ({ onMessage: () => {} }));
  });

  afterEach(async () => {
    await server.stop();
  });

  it("rejects upgrade with HTTP 403 when origin is not in allowlist", async () => {
    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"), {
      headers: { Origin: "https://attacker.example" },
    });

    const result = await new Promise<{ status?: number | undefined; rejected: boolean }>(
      (resolve) => {
        ws.on("unexpected-response", (_req, res) =>
          resolve({ status: res.statusCode, rejected: true }),
        );
        ws.on("error", () => resolve({ rejected: true }));
        ws.on("open", () => resolve({ rejected: false }));
      },
    );

    expect(result.rejected).toBe(true);
    if (result.status !== undefined) expect(result.status).toBe(403);
    ws.close();
  });

  it("accepts upgrade when origin is in the allowlist", async () => {
    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"), {
      headers: { Origin: "https://allowed.example" },
    });
    await waitForOpen(ws);
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
    await waitForClose(ws);
  });
});
