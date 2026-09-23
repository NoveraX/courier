import { describe, expect, it, vi } from "vitest";

import { handleSubscribe, handleMessage, handleUnsubscribe } from "../src/adapter/ws-dispatch";
import { qualifyTopic } from "../src/realtime/ws/topic-hash";
import type { WSSocketContext } from "../src/adapter/ws-context";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { ENDPOINT_SCHEMA } from "../src/validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A variables schema that supplies a default, so validation changes the shape. */
const DEFAULTING_SCHEMA = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (value: unknown) => ({ value: { limit: 50, ...(value as object) } }),
  },
};

function createEndpoint(transport: string, receive?: unknown, variables?: unknown): unknown {
  const fn = async function* () {
    yield "data";
  };
  const schema = { transport, ...(receive ? { receive } : {}), ...(variables ? { variables } : {}) };
  return {
    [ENDPOINT_SCHEMA]: schema,
    kind: "channel",
    method: "get",
    path: "",
    probe: fn,
    served: true,
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

  /**
   * The client qualifies a topic with a hash of its own variables and sends
   * both. They were never checked against each other, so a caller could pass
   * validation with variables of its own while subscribing under someone
   * else's qualifier — and receive what was published for them.
   */
  it("subscribes under the qualifier its own variables produce, not the one it sent", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ sources: { api: source } as never });

    await handleSubscribe(ctx, {
      type: "subscribe",
      id: "1",
      topic: "api.chat.feed#deadbeef",
      payload: { room: "mine" },
    });

    const subscribed = sent.find((m) => m.type === "subscribed");
    expect(subscribed!.topic).toBe(qualifyTopic("api.chat.feed", { room: "mine" }));
    expect(subscribed!.topic).not.toContain("deadbeef");
  });

  it("leaves an honest client's topic exactly as it sent it", async () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ sources: { api: source } as never });
    const honest = qualifyTopic("api.chat.feed", { room: "mine" });

    await handleSubscribe(ctx, {
      type: "subscribe",
      id: "1",
      topic: honest,
      payload: { room: "mine" },
    });

    expect(sent.find((m) => m.type === "subscribed")!.topic).toBe(honest);
  });

  /**
   * The publisher qualifies its topic from the variables *after* validation
   * (`ws-push.ts:56`). A subscription registered under the caller's own hash
   * therefore missed every message whenever a schema changed the shape — a
   * default, an added field. Deriving the qualifier server-side lines the two
   * up, and this pins that they agree.
   */
  it("subscribes under the qualifier the publisher will use, not the caller's", async () => {
    const endpoint = createEndpoint("ws", undefined, DEFAULTING_SCHEMA);
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ sources: { api: source } as never });

    await handleSubscribe(ctx, {
      type: "subscribe",
      id: "1",
      topic: qualifyTopic("api.chat.feed", { room: "a" }),
      payload: { room: "a" },
    });

    const subscribed = sent.find((m) => m.type === "subscribed");
    /* What the publisher computes, from the variables validation produced. */
    expect(subscribed!.topic).toBe(qualifyTopic("api.chat.feed", { limit: 50, room: "a" }));
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
      served: true,
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

  it("clears subscriptionIds and ends the subscription once when channel onJoin throws", async () => {
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
      served: true,
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

    // Exactly one end-of-subscription frame, code 5000, and no "subscribed"
    const ends = sent.filter((m) => m.type === "complete");
    expect(ends).toHaveLength(1);
    expect(ends[0]!.error?.code).toBe(5000);
    expect(sent.some((m) => m.type === "subscribed")).toBe(false);
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

/**
 * A channel typed with `.send<T>()` alone carries `bidirectional` but no
 * runtime schema. Requiring one meant every message it received vanished —
 * no handler, no error, nothing to see from either side.
 */
describe("handleMessage — a channel with no payload schema", () => {
  function channelCtx(schema: Record<string, unknown>) {
    const endpoint = {
      [ENDPOINT_SCHEMA]: schema,
      kind: "channel",
      method: "get",
      path: "",
      probe: async function* () {
        yield "x";
      },
      served: true,
      options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
    };
    const source = createSource("chat", "feed", endpoint as never);
    const made = createMockCtx({ sources: { api: source } as never });
    const delivered: unknown[] = [];
    made.ctx.topicManager.subscribe("conn-1", {
      topic: "api.chat.feed",
      cleanup: vi.fn(),
      onMessage: async (p: unknown) => void delivered.push(p),
    } as never);
    return { ...made, delivered };
  }

  const message = { type: "message" as const, id: "1", topic: "api.chat.feed", payload: { text: "hi" } };

  it("delivers to a channel that declared its shape in types only", async () => {
    const { ctx, delivered } = channelCtx({ transport: "ws", bidirectional: true });

    await handleMessage(ctx, message);

    expect(delivered).toEqual([{ text: "hi" }]);
  });

  it("still validates when a runtime schema was given", async () => {
    const refusing = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => ({ issues: [{ message: "no" }] }),
      },
    };
    const { ctx, sent, delivered } = channelCtx({
      transport: "ws",
      bidirectional: true,
      receive: refusing,
    });

    await handleMessage(ctx, message);

    expect(delivered).toEqual([]);
    expect(sent.find((m) => m.error?.code === 4422)).toBeDefined();
  });

  it("tells a caller that sent to an endpoint which accepts nothing", async () => {
    const { ctx, sent, delivered } = channelCtx({ transport: "ws" });

    await handleMessage(ctx, message);

    expect(delivered).toEqual([]);
    expect(sent.find((m) => m.error?.code === 4400)).toBeDefined();
  });
});
