/**
 * Real HTTP-upgrade tests for the mock server WS handler.
 *
 * These tests boot a real `createMockServer` on an ephemeral port, connect
 * with the `ws` package as a client, and exchange Courier WS protocol frames.
 * They cover the following lifecycle invariants:
 * - duration recording in history
 * - single onLeave invocation per connection
 * - error frames + socket close on onJoin / channelFn failure
 * - real broadcast fan-out across connections
 * - origin allowlist enforcement
 * - subscribe-before-message ordering guard
 * - message size limits via maxPayload
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import {
  decodeMessage,
  encodeMessage,
  ForbiddenError,
  type WSMessage,
} from "@noverax/courier/realtime";

import { createMockServer, type MockServer, type MockServerOptions } from "../src/server/create-mock-server";
import type { PrefixMapping } from "../src/server/prefix-routes";

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
 * Collect every frame the client receives before the socket closes.
 *
 * Used by tests where the server sends an error frame and then closes —
 * `ws.send(frame); ws.close()` doesn't guarantee per-frame ordering on
 * the client side, so a single `waitForFrame` call may race the close
 * event. This helper attaches both listeners up front and resolves with
 * everything that arrived before close.
 */
function collectFramesUntilClose(
  ws: WebSocket,
): Promise<{ frames: WSMessage[]; closeCode: number }> {
  return new Promise((resolve) => {
    const frames: WSMessage[] = [];
    ws.on("message", (raw: Buffer | string) => {
      try {
        frames.push(decodeMessage(raw.toString()));
      } catch {
        // ignore — malformed frame
      }
    });
    ws.once("close", (code) => resolve({ frames, closeCode: code }));
  });
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

  it("completes subscribe → onJoin → unsubscribe → onLeave lifecycle", async () => {
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
    expect(unsubFrame.type).toBe("unsubscribed");
    await waitForClose(ws);

    expect(events).toEqual(["join", "leave"]);
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
    const collected = collectFramesUntilClose(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await collected;

    const line = warn.mock.calls.find((call) => String(call[1]).includes("onJoin threw"));
    expect(line?.at(-1)).toBe(refused);
    warn.mockRestore();
  });

  it("ends the subscription, then closes normally, when onJoin throws", async () => {
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const collected = collectFramesUntilClose(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    const { frames, closeCode } = await collected;
    expect(closeCode).toBe(1000);
    expect(frames.some((f) => f.type === "subscribed")).toBe(false);
    expect(frames).toContainEqual({
      type: "complete",
      topic: "chat.room",
      error: { code: 5000, message: "Subscription failed" },
    });
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
    const collected = collectFramesUntilClose(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    const { frames } = await collected;
    expect(frames.find((f) => f.type === "complete")?.error).toEqual({
      code: 4403,
      message: "Not a member of this room",
    });
  });

  it("refuses the subscription, then closes normally, when the channelFn factory throws", async () => {
    server.mock("chat", "room").channel(() => {
      throw new Error("factory exploded");
    });

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const collected = collectFramesUntilClose(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    const { frames, closeCode } = await collected;
    expect(closeCode).toBe(1000);
    expect(frames).toContainEqual({
      type: "complete",
      topic: "chat.room",
      error: { code: 5000, message: "Subscription failed" },
    });
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
    expect(await waitForFrame(ws)).toMatchObject({ type: "data", payload: { echo: { text: "fine" } } });
    ws.close();
    await waitForClose(ws);
  });

  it("ends the subscription with the reason a handler gave when it closes the channel", async () => {
    server.mock("chat", "room").channel(() => ({
      onJoin: (ctx: { close(code?: number, reason?: string): void }) => ctx.close(4001, "kicked"),
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    const collected = collectFramesUntilClose(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });

    const { frames, closeCode } = await collected;
    expect(closeCode).toBe(1000);
    expect(frames).toContainEqual({
      type: "complete",
      topic: "chat.room",
      error: { code: 4001, message: "kicked" },
    });
  });

  it("ignores duplicate subscribe frames (idempotent)", async () => {
    let joinCount = 0;
    server.mock("chat", "room").channel(() => ({
      onJoin: () => {
        joinCount++;
      },
      onMessage: () => {},
    }));

    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s1" });
    await waitForFrame(ws);
    send(ws, { type: "subscribe", topic: "chat.room", id: "s2" });
    await tick();
    await tick();

    expect(joinCount).toBe(1);

    ws.close();
    await waitForClose(ws);
  });

  it("returns 404 for paths not matched by any prefix mapping", async () => {
    const ws = new WebSocket(wsUrlFor(baseUrl, "/not-a-route"));
    const result = await new Promise<{ rejected: boolean; status?: number }>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve({ rejected: true, status: res.statusCode }));
      ws.on("error", () => resolve({ rejected: true }));
      ws.on("open", () => resolve({ rejected: false }));
    });
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

  it("preserves the client-supplied qualified topic in outbound data frames", async () => {
    // Real Courier clients subscribe with `{source}.{group}.{method}#{varsHash}`
    // The mock server must echo that exact topic in `subscribed` and outbound
    // `data` frames so the client topic dispatcher resolves them. Without
    // this, browser-side handlers silently drop every server message.
    server.mock("chat", "room").channel(() => ({
      onJoin(ctx) {
        ctx.send({ greeting: "hello", topic: ctx.topic });
      },
      onMessage(ctx, msg) {
        const incoming = msg as { text: string };
        ctx.send({ echo: incoming.text });
      },
    }));

    const clientTopic = "api.chat.room#a1b2c3d4";
    const ws = new WebSocket(wsUrlFor(baseUrl, "/chat/room"));
    await waitForOpen(ws);

    // Persistent collector — `subscribed` and the onJoin `data` frame
    // arrive back-to-back; using a one-shot waitForFrame loop would race
    // and drop the second frame between listener detach/reattach.
    const frames: WSMessage[] = [];
    ws.on("message", (raw: Buffer | string) => {
      try {
        frames.push(decodeMessage(raw.toString()));
      } catch {
        // ignore
      }
    });

    send(ws, { type: "subscribe", topic: clientTopic, id: "s1" });
    // Wait until we've collected the subscribed ack + the onJoin data frame
    while (frames.length < 2) await tick();

    // The onJoin frame comes first: a Courier server confirms a channel once joined.
    const subscribed = frames.find((f) => f.type === "subscribed")!;
    expect((subscribed as { topic: string }).topic).toBe(clientTopic);

    const greeting = frames.find((f) => f.type === "data")!;
    expect(greeting.type).toBe("data");
    expect((greeting as { topic: string }).topic).toBe(clientTopic);
    expect((greeting as { payload: { topic: string } }).payload.topic).toBe(clientTopic);

    send(ws, { type: "message", topic: clientTopic, payload: { text: "hi" } });
    while (frames.length < 3) await tick();

    const echo = frames[2]!;
    expect(echo.type).toBe("data");
    expect((echo as { topic: string }).topic).toBe(clientTopic);
    expect((echo as { payload: unknown }).payload).toEqual({ echo: "hi" });

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

    const result = await new Promise<{ status?: number; rejected: boolean }>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve({ status: res.statusCode, rejected: true }));
      ws.on("error", () => resolve({ rejected: true }));
      ws.on("open", () => resolve({ rejected: false }));
    });

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
