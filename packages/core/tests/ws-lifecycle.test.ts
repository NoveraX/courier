import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { wsFrameLimit } from "../src/node";
import { wireEvents } from "../src/adapter/ws-lifecycle";
import type { WSSocketContext } from "../src/adapter/ws-context";
import { closeSubscriptionEntry } from "../src/adapter/ws-dispatch-helpers";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

let served: ServedWS | undefined;

afterEach(async () => {
  await stopWS(served);
  served = undefined;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ListenerMap = Map<string, Array<(event: unknown) => void>>;

function createMockWs() {
  const listeners: ListenerMap = new Map();
  return {
    readyState: 1,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener(type: string, handler: (event: never) => void) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(handler as (event: unknown) => void);
    },
    _emit(type: string, data?: unknown) {
      for (const h of listeners.get(type) ?? []) h(data);
    },
    _listeners: listeners,
  };
}

function createMockCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const ctx = {
    connectionId: "conn-1",
    requestId: "req-1",
    sendMessage: (msg: WSMessage) => sent.push(msg),
    dt: {},
    seq: { value: 5 },
    subscriptionIds: new Map(),
    subscribing: new Map(),
    t0: performance.now(),
    meta: {},
    maxMessageSize: 65536,
    maxMessagesPerSecond: 100,
    rateLimitBucket: { tokens: 100, lastRefillAt: Date.now() },
    maxControlPerSecond: 200,
    controlBucket: { tokens: 200, lastRefillAt: Date.now() },
    clientIP: "127.0.0.1",
    ...overrides,
  } as unknown as WSSocketContext;
  return { ctx, sent };
}

function createHeartbeat() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    receivedPong: vi.fn(),
  };
}

function createTopicManager() {
  return {
    disconnectAll: vi.fn(async () => {}),
    has: vi.fn(() => false),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    topicCount: vi.fn(() => 0),
    subscribers: vi.fn(() => []),
    size: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("wireEvents", () => {
  it("registers message, close, and error listeners", () => {
    const ws = createMockWs();
    const { ctx } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    expect(ws._listeners.has("message")).toBe(true);
    expect(ws._listeners.has("close")).toBe(true);
    expect(ws._listeners.has("error")).toBe(true);
  });

  it("routes a valid subscribe message through dispatch", async () => {
    const ws = createMockWs();
    const mockTopicManager = {
      has: vi.fn(() => false),
      topicCount: vi.fn(() => 0),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      disconnectAll: vi.fn(async () => {}),
      subscribers: vi.fn(() => []),
      size: 0,
    };
    const { ctx, sent } = createMockCtx({
      sources: {} as never,
      topicManager: mockTopicManager as never,
    });
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    // Subscribe without a valid source triggers error from dispatch
    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "s1", topic: "missing.feed" }),
    });

    await new Promise((r) => setTimeout(r, 10));

    // handleSubscribe ends it with a 4403 (anti-enumeration: source/endpoint hidden)
    const refused = sent.find((m) => m.type === "complete" && m.error?.code === 4403);
    expect(refused).toMatchObject({ topic: "missing.feed", id: "s1" });
  });

  it("rejects messages exceeding maxMessageSize", () => {
    const ws = createMockWs();
    const { ctx, sent } = createMockCtx({ maxMessageSize: 10 });
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    // Send a message larger than 10 bytes
    ws._emit("message", { data: "x".repeat(20) });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4413);
    expect(sent[0]!.error?.message).toBe("Message too large");
  });

  it("rejects invalid JSON messages", () => {
    const ws = createMockWs();
    const { ctx, sent } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    ws._emit("message", { data: "not-valid-json{{" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4400);
    expect(sent[0]!.error?.message).toBe("Invalid message format");
  });

  it("forwards pong to heartbeat", () => {
    const ws = createMockWs();
    const { ctx } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    ws._emit("message", { data: encodeMessage({ type: "pong" }) });

    expect(heartbeat.receivedPong).toHaveBeenCalledOnce();
  });

  it("stops heartbeat and cleans up on close", async () => {
    const ws = createMockWs();
    const onStreamClose = vi.fn();
    const subIds = new Map([["test.topic", { requestId: "sub-1", seq: { value: 3 }, t0: performance.now() }]]);
    const { ctx } = createMockCtx({ dt: { onStreamClose } as never, subscriptionIds: subIds as never });
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    ws._emit("close", { code: 1000 });
    await new Promise((r) => setTimeout(r, 10));

    expect(heartbeat.stop).toHaveBeenCalledOnce();
    expect((registry as { remove: ReturnType<typeof vi.fn> }).remove).toHaveBeenCalledWith("conn-1");
    expect(topicManager.disconnectAll).toHaveBeenCalledWith("conn-1");
    expect(onStreamClose).toHaveBeenCalledOnce();
  });

  it("close listener fires onWSUntrack/onStreamClose exactly once per topic even when a hook re-enters closeSubscriptionEntry", async () => {
    const ws = createMockWs();
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const subIds = new Map([
      ["api.feed.a", { requestId: "sub-a", seq: { value: 1 }, t0: performance.now() }],
      ["api.feed.b", { requestId: "sub-b", seq: { value: 2 }, t0: performance.now() }],
    ]);
    let ctxRef!: WSSocketContext;
    // Re-entrant attack: a hook callback synchronously closes the same topic
    // again. Without the delete-before-fire claim in closeSubscriptionEntry
    // and the loop routing through it, the hook would observe the entry and
    // fire onWSUntrack/onStreamClose a second time for the same subscription.
    onWSUntrack.mockImplementation(({ requestId }: { requestId: string }) => {
      const topic = requestId === "sub-a" ? "api.feed.a" : "api.feed.b";
      closeSubscriptionEntry(ctxRef, topic, "disconnect");
    });
    const { ctx } = createMockCtx({
      dt: { onWSUntrack, onStreamClose } as never,
      subscriptionIds: subIds as never,
    });
    ctxRef = ctx;
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);
    ws._emit("close", { code: 1000 });
    await new Promise((r) => setTimeout(r, 10));

    // Exactly two fires total — one per original topic, never doubled.
    expect(onWSUntrack).toHaveBeenCalledTimes(2);
    expect(onStreamClose).toHaveBeenCalledTimes(2);
    // Each onStreamClose carries reason="disconnect".
    for (const call of onStreamClose.mock.calls) {
      expect(call[0]).toMatchObject({ reason: "disconnect" });
    }
    // ctx.subscriptionIds is empty after the loop because closeSubscriptionEntry
    // deletes each entry as it claims ownership.
    expect(ctx.subscriptionIds.size).toBe(0);
  });

  it("calls onDisconnect hook on close", async () => {
    const ws = createMockWs();
    const { ctx } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const onDisconnect = vi.fn();
    const config = { sources: {}, onDisconnect } as unknown as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    ws._emit("close", { code: 1001 });
    await new Promise((r) => setTimeout(r, 10));

    expect(onDisconnect).toHaveBeenCalledWith({
      connectionId: "conn-1",
      meta: {},
      code: 1001,
    });
  });

  it("does not crash if onDisconnect throws", async () => {
    const ws = createMockWs();
    const { ctx } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const onDisconnect = vi.fn(() => { throw new Error("hook failed"); });
    const config = { sources: {}, onDisconnect } as unknown as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    // Should not throw
    ws._emit("close", { code: 1000 });
    await new Promise((r) => setTimeout(r, 10));

    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("stops heartbeat and calls onError on error event", () => {
    const ws = createMockWs();
    const { ctx } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const onError = vi.fn();
    const config = { sources: {}, onError } as unknown as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    const errorEvent = new Error("socket error");
    ws._emit("error", errorEvent);

    expect(heartbeat.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith({
      connectionId: "conn-1",
      meta: {},
      error: errorEvent,
    });
  });

  it("hands onError the Error a socket error event carries", async () => {
    const errors: unknown[] = [];
    served = await serveWS({}, { onError: ({ error }) => errors.push(error) });
    const client = new WebSocket(served.url);
    await new Promise((resolve) => client.once("open", resolve));

    client.send("x".repeat(wsFrameLimit() + 1));
    await new Promise((resolve) => client.once("close", resolve));
    await settle(20);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RangeError);
    expect(String(errors[0])).toContain("Max payload size exceeded");
  });

  it("does not crash if onError hook throws", () => {
    const ws = createMockWs();
    const { ctx } = createMockCtx();
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const onError = vi.fn(() => { throw new Error("hook failed"); });
    const config = { sources: {}, onError } as unknown as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    // Should not throw
    ws._emit("error", new Error("test"));

    expect(onError).toHaveBeenCalledOnce();
  });

  it("converts non-string message data to string", () => {
    const ws = createMockWs();
    const { ctx, sent } = createMockCtx({ maxMessageSize: 5 });
    const heartbeat = createHeartbeat();
    const topicManager = createTopicManager();
    const config = { sources: {} } as WSHandlerConfig;
    const registry = { remove: vi.fn() } as never;

    wireEvents(ws, ctx, heartbeat as never, topicManager as never, config, registry);

    // Pass a Buffer-like that toString returns large content
    ws._emit("message", { data: Buffer.from("x".repeat(20)) });

    // String(Buffer) includes "x".repeat(20), which is > 5 bytes
    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4413);
  });
});
