import { describe, expect, it, vi } from "vitest";

import { handleSubscribe, handleMessage, handleUnsubscribe } from "../src/adapter/ws-dispatch";
import type { WSSocketContext } from "../src/adapter/ws-context";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { ENDPOINT_SCHEMA } from "../src/validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEndpoint(transport: string, receive?: unknown): unknown {
  const fn = async function* () {
    yield "data";
  };
  const schema = { transport, ...(receive ? { receive } : {}) };
  return {
    [ENDPOINT_SCHEMA]: schema,
    kind: "channel",
    method: "get",
    path: "",
    probe: fn,
    options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
  };
}

function createSource(group: string, method: string, endpoint: unknown): unknown {
  return {
    options: {
      groups: {
        [group]: {
          endpoints: { [method]: endpoint },
          options: {},
          [method]: endpoint,
        },
      },
    },
    [group]: { [method]: endpoint },
    [method]: endpoint,
  };
}

function createMockCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const topicSubs = new Map<string, Map<string, { topic: string; cleanup: () => void }>>();

  const ctx = {
    connectionId: "conn-1",
    requestId: "req-1",
    sources: {},
    pubsub: undefined,
    registry: { broadcastToTopic: vi.fn() },
    bridge: undefined,
    topicManager: {
      has: (connId: string, topic: string) => topicSubs.get(connId)?.has(topic) ?? false,
      topicCount: (connId: string) => topicSubs.get(connId)?.size ?? 0,
      get: (connId: string, topic: string) => topicSubs.get(connId)?.get(topic),
      subscribe: (connId: string, entry: { topic: string; cleanup: () => void }) => {
        if (!topicSubs.has(connId)) topicSubs.set(connId, new Map());
        topicSubs.get(connId)!.set(entry.topic, entry);
      },
      unsubscribe: vi.fn(async (connId: string, topic: string) => {
        const entry = topicSubs.get(connId)?.get(topic);
        if (entry) {
          await entry.cleanup();
          topicSubs.get(connId)!.delete(topic);
        }
      }),
    },
    sendMessage: (msg: WSMessage) => sent.push(msg),
    dt: {},
    seq: { value: 0 },
    subscriptionIds: new Map(),
    t0: performance.now(),
    request: new Request("http://localhost/ws"),
    meta: {},
    maxSubscriptions: 100,
    maxMessageSize: 65536,
    middlewareTimeoutMs: 30000,
    closed: false,
    ...overrides,
  } as unknown as WSSocketContext;

  return { ctx, sent };
}

// ---------------------------------------------------------------------------
// handleSubscribe
// ---------------------------------------------------------------------------

describe("handleSubscribe", () => {
  it("sends error when topic is missing", async () => {
    const { ctx, sent } = createMockCtx();
    await handleSubscribe(ctx, { type: "subscribe", id: "1" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4400);
    expect(sent[0]!.error?.message).toBe("Missing topic");
  });

  it("resubscribe tears down old subscription and succeeds", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ sources: { api: source } as never });

    // First subscribe — succeeds
    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.feed" });
    expect(sent.filter((m) => m.type === "subscribed")).toHaveLength(1);

    // Second subscribe to same topic — resubscribes (reconnect dedup)
    await handleSubscribe(ctx, { type: "subscribe", id: "2", topic: "api.chat.feed" });
    expect(sent.filter((m) => m.type === "subscribed")).toHaveLength(2);
    expect(sent.filter((m) => m.type === "error")).toHaveLength(0);
  });

  it("sends error when max subscriptions reached", async () => {
    const { ctx, sent } = createMockCtx({ maxSubscriptions: 0 });
    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.feed" });

    const error = sent.find((m) => m.error?.code === 4429);
    expect(error).toBeDefined();
    expect(error!.error?.message).toBe("Too many subscriptions");
  });

  it("sends subscribed confirmation for valid push endpoint", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ sources: { api: source } as never });

    await handleSubscribe(ctx, { type: "subscribe", id: "sub-1", topic: "api.chat.feed" });

    const subscribed = sent.find((m) => m.type === "subscribed");
    expect(subscribed).toBeDefined();
    expect(subscribed!.topic).toBe("api.chat.feed");
    expect(subscribed!.id).toBe("sub-1");
  });

  // ── Studio Playground correlation: subRequestId === ctx.playgroundRequestId ──

  it("uses ctx.playgroundRequestId as subRequestId when set (Studio Playground correlation)", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const onStreamOpen = vi.fn();
    const PLAYGROUND_RID = "playground-rid-ws-456";
    const { ctx } = createMockCtx({
      sources: { api: source } as never,
      playgroundRequestId: PLAYGROUND_RID,
      dt: { onStreamOpen } as never,
    });

    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.feed" });

    // The subscription's tracking entry must use the playground id, AND the
    // onStreamOpen hook must fire with that exact id — that's the correlation
    // path the Studio UI playground tab depends on.
    const tracker = ctx.subscriptionIds.get("api.chat.feed");
    expect(tracker?.requestId).toBe(PLAYGROUND_RID);
    expect(onStreamOpen).toHaveBeenCalledOnce();
    expect(onStreamOpen.mock.calls[0]![0].requestId).toBe(PLAYGROUND_RID);
  });

  it("falls back to generated subRequestId when ctx.playgroundRequestId is undefined", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const onStreamOpen = vi.fn();
    const { ctx } = createMockCtx({
      sources: { api: source } as never,
      playgroundRequestId: undefined,
      dt: { onStreamOpen } as never,
    });

    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.feed" });

    const tracker = ctx.subscriptionIds.get("api.chat.feed");
    expect(tracker?.requestId).toBeTruthy();
    expect(tracker?.requestId).not.toBe("playground-rid-ws-456");
    expect(onStreamOpen.mock.calls[0]![0].requestId).toBe(tracker?.requestId);
  });

  // ── ctx.closed guard prevents leak when socket closes mid-await ──

  it("bails out without registering tracking when ctx.closed flips during authorize", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const onStreamOpen = vi.fn();
    let ctxRef!: WSSocketContext;
    const { ctx, sent } = createMockCtx({
      sources: { api: source } as never,
      dt: { onStreamOpen } as never,
      authorize: async () => {
        ctxRef.closed = true;
        return true;
      },
    });
    ctxRef = ctx;

    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.feed" });

    // Guard after authorize aborted before subscriptionIds.set / onStreamOpen
    expect(ctx.subscriptionIds.size).toBe(0);
    expect(onStreamOpen).not.toHaveBeenCalled();
    expect(sent.find((m) => m.type === "subscribed")).toBeUndefined();
  });

  it("clears tracking entry when ctx.closed flips during channel onJoin", async () => {
    const receiveSchema = { "~standard": { validate: (v: unknown) => ({ value: v }) } };
    let ctxRef!: WSSocketContext;
    const onJoin = vi.fn(async () => {
      // socket close fires during the await
      ctxRef.closed = true;
    });
    const factory = () => ({ onJoin, onMessage: vi.fn() });
    const schema = {
      transport: "ws",
      receive: receiveSchema,
    };
    const wsEndpoint = {
      [ENDPOINT_SCHEMA]: schema,
      kind: "channel",
      method: "get",
      path: "",
      probe: factory,
      options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
    };
    const source = createSource("chat", "room", wsEndpoint);
    const { ctx, sent } = createMockCtx({ sources: { api: source } as never });
    ctxRef = ctx;

    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.room" });

    expect(onJoin).toHaveBeenCalledOnce();
    // Post-startChannel guard runs closeSubscriptionEntry
    expect(ctx.subscriptionIds.size).toBe(0);
    // No "subscribed" frame on a dead socket
    expect(sent.find((m) => m.type === "subscribed")).toBeUndefined();
  });

  // ── onJoin throw routes through outer catch → closeSubscriptionEntry ──

  it("clears subscriptionIds and sends single error when channel onJoin throws", async () => {
    const receiveSchema = { "~standard": { validate: (v: unknown) => ({ value: v }) } };
    const factory = () => ({
      onJoin: () => { throw new Error("Auth failed"); },
      onMessage: vi.fn(),
    });
    const schema = {
      transport: "ws",
      receive: receiveSchema,
    };
    const wsEndpoint = {
      [ENDPOINT_SCHEMA]: schema,
      kind: "channel",
      method: "get",
      path: "",
      probe: factory,
      options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
    };
    const source = createSource("chat", "room", wsEndpoint);
    const onStreamClose = vi.fn();
    const onWSUntrack = vi.fn();
    const { ctx, sent } = createMockCtx({
      sources: { api: source } as never,
      dt: { onStreamClose, onWSUntrack } as never,
    });

    await handleSubscribe(ctx, { type: "subscribe", id: "1", topic: "api.chat.room" });

    // closeSubscriptionEntry MUST run via outer catch — not silently leak
    expect(ctx.subscriptionIds.size).toBe(0);
    expect(onWSUntrack).toHaveBeenCalledOnce();
    expect(onStreamClose).toHaveBeenCalledOnce();

    // Exactly one error frame, code 5000
    const errors = sent.filter((m) => m.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error?.code).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// handleMessage
// ---------------------------------------------------------------------------

describe("handleMessage", () => {
  it("sends error when not subscribed to topic", async () => {
    const { ctx, sent } = createMockCtx();
    await handleMessage(ctx, { type: "message", id: "m1", topic: "api.chat.feed" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4404);
    expect(sent[0]!.error?.message).toBe("Not subscribed");
  });

  it("sends error when topic is missing", async () => {
    const { ctx, sent } = createMockCtx();
    await handleMessage(ctx, { type: "message", id: "m1" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4404);
  });

  it("increments seq and calls onStreamMessage for valid receive endpoint", async () => {
    const receiveSchema = {
      "~standard": { validate: () => ({ value: "ok" }) },
    };
    const endpoint = createEndpoint("ws", receiveSchema);
    const source = createSource("chat", "feed", endpoint);
    const onStreamMessage = vi.fn();
    const { ctx, sent } = createMockCtx({
      sources: { api: source } as never,
      dt: { onStreamMessage } as never,
    });

    // Manually register subscription so topicManager.has returns true
    ctx.topicManager.subscribe("conn-1", { topic: "api.chat.feed", cleanup: vi.fn() });

    await handleMessage(ctx, {
      type: "message",
      id: "m1",
      topic: "api.chat.feed",
      payload: "test",
    });

    expect(ctx.seq.value).toBe(1);
    expect(onStreamMessage).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(0);
  });

  it("bails out when ctx.closed flips during validateSchema", async () => {
    let ctxRef!: WSSocketContext;
    const receiveSchema = {
      "~standard": {
        validate: async () => {
          ctxRef.closed = true;
          return { value: "ok" };
        },
      },
    };
    const endpoint = createEndpoint("ws", receiveSchema);
    const source = createSource("chat", "feed", endpoint);
    const onStreamMessage = vi.fn();
    const onMessage = vi.fn();
    const { ctx, sent } = createMockCtx({
      sources: { api: source } as never,
      dt: { onStreamMessage } as never,
    });
    ctxRef = ctx;
    ctx.topicManager.subscribe("conn-1", { topic: "api.chat.feed", cleanup: vi.fn(), onMessage });

    await handleMessage(ctx, { type: "message", id: "m1", topic: "api.chat.feed", payload: "x" });

    expect(ctx.seq.value).toBe(0);
    expect(onStreamMessage).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("bails out when ctx.closed flips during authorizeMessage", async () => {
    let ctxRef!: WSSocketContext;
    const receiveSchema = { "~standard": { validate: () => ({ value: "ok" }) } };
    const endpoint = createEndpoint("ws", receiveSchema);
    const source = createSource("chat", "feed", endpoint);
    const onMessage = vi.fn();
    const authorizeMessage = vi.fn(async () => {
      ctxRef.closed = true;
      return true;
    });
    const { ctx, sent } = createMockCtx({
      sources: { api: source } as never,
      authorizeMessage,
    } as never);
    ctxRef = ctx;
    ctx.topicManager.subscribe("conn-1", { topic: "api.chat.feed", cleanup: vi.fn(), onMessage });

    await handleMessage(ctx, { type: "message", id: "m1", topic: "api.chat.feed", payload: "x" });

    expect(ctx.seq.value).toBe(0);
    expect(onMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// handleUnsubscribe
// ---------------------------------------------------------------------------

describe("handleUnsubscribe", () => {
  it("does nothing when topic is missing", async () => {
    const { ctx, sent } = createMockCtx();
    await handleUnsubscribe(ctx, { type: "unsubscribe", id: "u1" });

    expect(sent).toHaveLength(0);
  });

  it("unsubscribes and sends confirmation", async () => {
    const { ctx, sent } = createMockCtx();

    // Register a subscription first
    ctx.topicManager.subscribe("conn-1", { topic: "api.chat.feed", cleanup: vi.fn() });

    await handleUnsubscribe(ctx, { type: "unsubscribe", id: "u1", topic: "api.chat.feed" });

    expect(ctx.topicManager.unsubscribe).toHaveBeenCalledWith("conn-1", "api.chat.feed");
    const unsub = sent.find((m) => m.type === "unsubscribed");
    expect(unsub).toBeDefined();
    expect(unsub!.topic).toBe("api.chat.feed");
    expect(unsub!.id).toBe("u1");
  });

  it("bails out when ctx.closed flips during topicManager.unsubscribe", async () => {
    const { ctx, sent } = createMockCtx();
    ctx.topicManager.subscribe("conn-1", { topic: "api.chat.feed", cleanup: vi.fn() });
    (ctx.topicManager.unsubscribe as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      (ctx as { closed: boolean }).closed = true;
    });

    await handleUnsubscribe(ctx, { type: "unsubscribe", id: "u1", topic: "api.chat.feed" });

    expect(sent).toHaveLength(0);
  });
});
