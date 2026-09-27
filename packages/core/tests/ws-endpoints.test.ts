import { describe, expect, it, vi } from "vitest";

import { startPush, startChannel } from "../src/adapter/ws-endpoints";
import type { WSSocketContext } from "../src/adapter/ws-context";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockEntry {
  topic: string;
  cleanup: () => void | Promise<void>;
  onMessage?: (payload: unknown) => void | Promise<void>;
}

function createMockCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
  subscriptions: Map<string, MockEntry>;
} {
  const sent: WSMessage[] = [];
  const subscriptions = new Map<string, MockEntry>();

  const ctx = {
    connectionId: "conn-1",
    requestId: "req-1",
    subscriptionIds: new Map(),
    subscribing: new Map(),
    sendMessage: (msg: WSMessage) => sent.push(msg),
    dt: {},
    seq: { value: 0 },
    meta: { userId: "u1" },
    topicManager: {
      subscribe: vi.fn((_connId: string, entry: MockEntry) => {
        subscriptions.set(entry.topic, entry);
      }),
      unsubscribe: vi.fn(async (_connId: string, topic: string) => {
        subscriptions.delete(topic);
      }),
    },
    registry: { broadcastToTopic: vi.fn() },
    pubsub: undefined,
    ...overrides,
  } as unknown as WSSocketContext;

  return { ctx, sent, subscriptions };
}

// ---------------------------------------------------------------------------
// startPush
// ---------------------------------------------------------------------------

describe("startPush", () => {
  it("iterates async generator and sends data messages", async () => {
    const { ctx, sent } = createMockCtx();
    const handler = async function* () {
      yield "first";
      yield "second";
    };

    startPush(ctx, "api.chat.feed", handler, {});
    await new Promise((r) => setTimeout(r, 50));

    const dataMessages = sent.filter((m) => m.type === "data");
    expect(dataMessages).toHaveLength(2);
    expect(dataMessages[0]!.payload).toBe("first");
    expect(dataMessages[0]!.topic).toBe("api.chat.feed");
    expect(dataMessages[0]!.seq).toBe(1);
    expect(dataMessages[1]!.payload).toBe("second");
    expect(dataMessages[1]!.seq).toBe(2);
  });

  it("increments seq on each yielded value", async () => {
    const { ctx } = createMockCtx();
    const handler = async function* () {
      yield "a";
      yield "b";
      yield "c";
    };

    startPush(ctx, "topic", handler, {});
    await new Promise((r) => setTimeout(r, 50));

    expect(ctx.seq.value).toBe(3);
  });

  it("registers subscription with cleanup in topicManager", () => {
    const { ctx, subscriptions } = createMockCtx();
    const handler = async function* () {
      await new Promise(() => {});
    };

    startPush(ctx, "api.chat.feed", handler, {});

    expect(ctx.topicManager.subscribe).toHaveBeenCalledOnce();
    expect(subscriptions.has("api.chat.feed")).toBe(true);
    expect(typeof subscriptions.get("api.chat.feed")!.cleanup).toBe("function");
  });

  it("stops iteration when cleanup is called", async () => {
    const { ctx, sent, subscriptions } = createMockCtx();
    let yieldCount = 0;
    const handler = async function* () {
      while (true) {
        yieldCount++;
        yield `msg-${yieldCount}`;
        await new Promise((r) => setTimeout(r, 10));
      }
    };

    startPush(ctx, "topic", handler, {});
    await new Promise((r) => setTimeout(r, 30));

    // Trigger cleanup
    subscriptions.get("topic")!.cleanup();
    const countBefore = sent.filter((m) => m.type === "data").length;

    await new Promise((r) => setTimeout(r, 50));
    const countAfter = sent.filter((m) => m.type === "data").length;

    // No new messages after cleanup
    expect(countAfter).toBe(countBefore);
  });

  it("ends the subscription with a failure when the generator throws", async () => {
    const { ctx, sent } = createMockCtx();
    const handler = async function* () {
      yield "ok";
      throw new Error("Generator failed");
    };

    startPush(ctx, "topic", handler, {}, "sub-1");
    await new Promise((r) => setTimeout(r, 50));

    expect(sent.at(-1)).toEqual({
      type: "complete",
      topic: "topic",
      id: "sub-1",
      error: { code: 5000, message: "Subscription failed" },
    });
  });

  it("ends the subscription when the generator returns", async () => {
    const { ctx, sent } = createMockCtx();
    const handler = async function* () {
      yield "only";
    };

    startPush(ctx, "topic", handler, {});
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.at(-1)).toEqual({ type: "complete", topic: "topic" });
  });

  it("says nothing more once the client ended the subscription itself", async () => {
    const { ctx, sent, subscriptions } = createMockCtx();
    const handler = async function* () {
      yield "first";
      await new Promise(() => {});
    };

    startPush(ctx, "topic", handler, {});
    await new Promise((r) => setTimeout(r, 10));
    await subscriptions.get("topic")!.cleanup();
    await new Promise((r) => setTimeout(r, 10));

    expect(sent.some((m) => m.type === "complete")).toBe(false);
  });

  it("passes variables and connectionId to handler via WSContext", async () => {
    const handler = vi.fn(async function* () {});
    const { ctx } = createMockCtx();

    startPush(ctx, "topic", handler, { id: 42 });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledWith({
      topic: "topic",
      variables: { id: 42 },
      connectionId: "conn-1",
      meta: { userId: "u1" },
      signal: expect.any(AbortSignal),
    });
  });

  it("calls onStreamMessage for each yielded value", async () => {
    const onStreamMessage = vi.fn();
    const { ctx } = createMockCtx({ dt: { onStreamMessage } as never });
    const handler = async function* () {
      yield "data";
    };

    startPush(ctx, "topic", handler, {});
    await new Promise((r) => setTimeout(r, 50));

    expect(onStreamMessage).toHaveBeenCalledOnce();
    expect(onStreamMessage.mock.calls[0]![0].eventType).toBe("data");
  });

  it("throws on when handler init throws, for the subscribe flow to refuse once", () => {
    const handler = () => { throw new Error("Init boom"); };
    const { ctx, sent } = createMockCtx();

    expect(() => startPush(ctx, "topic", handler, {})).toThrow("Init boom");
    expect(sent).toEqual([]);
    expect(ctx.topicManager.subscribe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startChannel
// ---------------------------------------------------------------------------

describe("startChannel", () => {
  it("calls onJoin when channel starts", async () => {
    const onJoin = vi.fn();
    const factory = () => ({ onJoin });
    const { ctx } = createMockCtx();

    await startChannel(ctx, "api.chat.room", factory, { roomId: "r1" });

    expect(onJoin).toHaveBeenCalledOnce();
    const channelCtx = onJoin.mock.calls[0]![0];
    expect(channelCtx.variables).toEqual({ roomId: "r1" });
    expect(channelCtx.connectionId).toBe("conn-1");
  });

  it("provides send function that sends data messages", async () => {
    const onJoin = vi.fn();
    const factory = () => ({ onJoin });
    const { ctx, sent } = createMockCtx();

    await startChannel(ctx, "api.chat.room", factory, {});

    const channelCtx = onJoin.mock.calls[0]![0];
    channelCtx.send({ text: "hello" });

    const dataMsg = sent.find((m) => m.type === "data");
    expect(dataMsg).toBeDefined();
    expect(dataMsg!.payload).toEqual({ text: "hello" });
    expect(dataMsg!.topic).toBe("api.chat.room");
  });

  it("close with a code ends the subscription with it as the reason", async () => {
    const onJoin = vi.fn();
    const factory = () => ({ onJoin });
    const { ctx, sent } = createMockCtx();

    await startChannel(ctx, "topic", factory, {}, "sub-1");

    const channelCtx = onJoin.mock.calls[0]![0];
    channelCtx.close(4001, "kicked");

    expect(sent.at(-1)).toEqual({
      type: "complete",
      topic: "topic",
      id: "sub-1",
      error: { code: 4001, message: "kicked" },
    });
    expect(ctx.topicManager.unsubscribe).toHaveBeenCalledWith("conn-1", "topic");
  });

  it("close without a code ends the subscription as finished", async () => {
    const onJoin = vi.fn();
    const factory = () => ({ onJoin });
    const { ctx, sent } = createMockCtx();

    await startChannel(ctx, "topic", factory, {});

    const channelCtx = onJoin.mock.calls[0]![0];
    channelCtx.close();

    expect(sent.at(-1)).toEqual({ type: "complete", topic: "topic" });
    expect(ctx.topicManager.unsubscribe).toHaveBeenCalledWith("conn-1", "topic");
  });

  it("provides broadcast function that uses registry", async () => {
    const onJoin = vi.fn();
    const factory = () => ({ onJoin });
    const { ctx } = createMockCtx();

    await startChannel(ctx, "topic", factory, {});

    const channelCtx = onJoin.mock.calls[0]![0];
    channelCtx.broadcast("room.messages", { text: "hi" });

    expect(ctx.registry.broadcastToTopic).toHaveBeenCalledWith(
      "room.messages",
      { text: "hi" },
      "conn-1",
    );
  });

  it("calls onLeave during cleanup", async () => {
    const onLeave = vi.fn();
    const factory = () => ({ onJoin: vi.fn(), onLeave });
    const { ctx, subscriptions } = createMockCtx();

    await startChannel(ctx, "topic", factory, {});

    expect(subscriptions.has("topic")).toBe(true);

    await subscriptions.get("topic")!.cleanup();

    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("registers subscription in topicManager", async () => {
    const factory = () => ({ onJoin: vi.fn() });
    const { ctx } = createMockCtx();

    await startChannel(ctx, "api.chat.room", factory, {});

    expect(ctx.topicManager.subscribe).toHaveBeenCalledOnce();
  });

  it("publishes to the other replicas via broadcast", async () => {
    const publishToTopic = vi.fn(async () => undefined);
    const onJoin = vi.fn();
    const factory = () => ({ onJoin });
    const { ctx } = createMockCtx({ bridge: { publishToTopic } as never });

    await startChannel(ctx, "topic", factory, {});

    const channelCtx = onJoin.mock.calls[0]![0];
    channelCtx.broadcast("room", "hello");

    expect(publishToTopic).toHaveBeenCalledWith("room", "hello");
  });

  it("rolls back subscription and rethrows when onJoin throws", async () => {
    const factory = () => ({
      onJoin: () => { throw new Error("Auth failed"); },
    });
    const { ctx, sent } = createMockCtx();

    await expect(startChannel(ctx, "topic", factory, {})).rejects.toThrow("Auth failed");

    // Subscription was rolled back via unsubscribe BEFORE the rethrow
    expect(ctx.topicManager.unsubscribe).toHaveBeenCalledWith("conn-1", "topic");
    // No error frame is sent locally — the outer handleSubscribe catch owns
    // the client-facing error so closeSubscriptionEntry runs exactly once.
    expect(sent.find((m) => m.type === "error")).toBeUndefined();
  });

  it("throws on when the factory throws, for the subscribe flow to refuse once", async () => {
    const factory = () => { throw new Error("Bad factory"); };
    const { ctx, sent } = createMockCtx();

    await expect(startChannel(ctx, "topic", factory, {})).rejects.toThrow("Bad factory");
    expect(sent).toEqual([]);
  });

  it("catches onLeave errors during cleanup without throwing", async () => {
    const factory = () => ({
      onJoin: vi.fn(),
      onLeave: () => { throw new Error("Cleanup boom"); },
    });
    const { ctx, subscriptions } = createMockCtx();

    await startChannel(ctx, "topic", factory, {});

    // Should not throw
    await subscriptions.get("topic")!.cleanup();
  });

  it("catches onMessage errors and sends error to client", async () => {
    const factory = () => ({
      onJoin: vi.fn(),
      onMessage: () => { throw new Error("Bad payload"); },
    });
    const { ctx, sent, subscriptions } = createMockCtx();

    await startChannel(ctx, "topic", factory, {});

    const entry = subscriptions.get("topic")!;
    await entry.onMessage!("test-data");

    const error = sent.find((m) => m.type === "error" && m.error?.code === 5000);
    expect(error).toBeDefined();
    expect(error!.error?.message).toBe("Handler error");
  });
});
