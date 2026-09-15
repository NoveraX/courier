import { describe, expect, it, vi } from "vitest";
import { createConnectionRegistry } from "../src/adapter/ws-registry";
import type { RegistryEntry } from "../src/adapter/ws-registry";
import { handleMessage } from "../src/adapter/ws-dispatch";
import type { WSSocketContext } from "../src/adapter/ws-context";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { ENDPOINT_SCHEMA } from "../src/validation";

function createEntry(id: string, meta: Record<string, unknown> = {}): RegistryEntry {
  return {
    connectionId: id,
    meta,
    connectedAt: Date.now(),
    sendRaw: vi.fn(),
    sendEncoded: vi.fn(),
    close: vi.fn(),
  };
}

describe("disconnectByMeta", () => {
  it("disconnects all connections matching predicate", () => {
    const registry = createConnectionRegistry();
    const admin = createEntry("a1", { role: "admin" });
    const user1 = createEntry("u1", { role: "user" });
    const user2 = createEntry("u2", { role: "user" });
    registry.add(admin);
    registry.add(user1);
    registry.add(user2);

    registry.disconnectByMeta((m) => m.role === "user");

    expect(user1.close).toHaveBeenCalledOnce();
    expect(user2.close).toHaveBeenCalledOnce();
    expect(admin.close).not.toHaveBeenCalled();
  });

  it("uses custom close code and reason", () => {
    const registry = createConnectionRegistry();
    const entry = createEntry("c1", { banned: true });
    registry.add(entry);

    registry.disconnectByMeta((m) => m.banned === true, 4403, "Account banned");

    expect(entry.close).toHaveBeenCalledWith(4403, "Account banned");
  });

  it("does nothing when no connections match", () => {
    const registry = createConnectionRegistry();
    const entry = createEntry("c1", { role: "admin" });
    registry.add(entry);

    registry.disconnectByMeta((m) => m.role === "ghost");

    expect(entry.close).not.toHaveBeenCalled();
  });
});

describe("updateMeta", () => {
  it("updates connection metadata", () => {
    const registry = createConnectionRegistry();
    const entry = createEntry("c1", { userId: "old" });
    registry.add(entry);

    registry.updateMeta("c1", { userId: "new", role: "admin" });

    const info = registry.get("c1");
    expect(info?.meta).toEqual({ userId: "new", role: "admin" });
  });

  it("is safe for unknown connectionId", () => {
    const registry = createConnectionRegistry();
    expect(() => registry.updateMeta("unknown", {})).not.toThrow();
  });
});

describe("getEntry", () => {
  it("returns raw entry for internal use", () => {
    const registry = createConnectionRegistry();
    const entry = createEntry("c1");
    registry.add(entry);

    const raw = registry.getEntry("c1");
    expect(raw).toBe(entry);
  });

  it("returns undefined for unknown ID", () => {
    const registry = createConnectionRegistry();
    expect(registry.getEntry("unknown")).toBeUndefined();
  });
});

// --- Per-message authorization ---

function createMsgCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const topicSubs = new Map<string, Map<string, { topic: string; onMessage?: (p: unknown) => void }>>();

  const wsEndpoint = (() => {
    const fn = () => ({ onMessage: vi.fn() });
    const schema = {
      transport: "ws",
      receive: { "~standard": { validate: async (v: unknown) => ({ value: v }) } },
    };
    return {
      [ENDPOINT_SCHEMA]: schema,
      kind: "channel",
      method: "get",
      path: "",
      probe: fn,
      options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
    };
  })();

  const ctx = {
    connectionId: "conn-1",
    requestId: "req-1",
    sources: { api: { options: { groups: { chat: { send: wsEndpoint, options: {} } } }, chat: { send: wsEndpoint } } },
    pubsub: undefined,
    registry: { broadcastToTopic: vi.fn() },
    bridge: undefined,
    topicManager: {
      has: (connId: string, topic: string) => topicSubs.get(connId)?.has(topic) ?? false,
      get: (connId: string, topic: string) => topicSubs.get(connId)?.get(topic),
    },
    sendMessage: (msg: WSMessage) => sent.push(msg),
    dt: { onStreamMessage: vi.fn() },
    subscriptionIds: new Map(),
    seq: { value: 0 },
    t0: performance.now(),
    request: new Request("http://localhost/ws"),
    meta: { userId: "user-1" },
    maxSubscriptions: 100,
    maxMessageSize: 65536,
    middlewareTimeoutMs: 30000,
    authorizeMessage: undefined,
    ...overrides,
  } as unknown as WSSocketContext;

  // Pre-subscribe to topic
  topicSubs.set("conn-1", new Map([["api.chat.send#abc", {
    topic: "api.chat.send#abc",
    onMessage: vi.fn(),
  }]]));

  return { ctx, sent };
}

describe("per-message authorization", () => {
  it("allows message when authorizeMessage returns true", async () => {
    const authorizeMessage = vi.fn().mockResolvedValue(true);
    const { ctx, sent } = createMsgCtx({ authorizeMessage });

    await handleMessage(ctx, { type: "message", topic: "api.chat.send#abc", payload: "hi" });

    expect(authorizeMessage).toHaveBeenCalledWith({
      connectionId: "conn-1",
      meta: { userId: "user-1" },
      topic: "api.chat.send#abc",
      payload: "hi",
    });
    expect(sent).toHaveLength(0); // No error
  });

  it("rejects message with 4403 when authorizeMessage returns false", async () => {
    const authorizeMessage = vi.fn().mockResolvedValue(false);
    const { ctx, sent } = createMsgCtx({ authorizeMessage });

    await handleMessage(ctx, { type: "message", id: "m1", topic: "api.chat.send#abc", payload: "hi" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4403);
    expect(sent[0]!.error?.message).toBe("Message rejected");
  });

  it("rejects message when authorizeMessage throws", async () => {
    const authorizeMessage = vi.fn().mockRejectedValue(new Error("forbidden"));
    const { ctx, sent } = createMsgCtx({ authorizeMessage });

    await handleMessage(ctx, { type: "message", id: "m2", topic: "api.chat.send#abc", payload: "hi" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4403);
  });

  it("skips authorization when authorizeMessage is not configured", async () => {
    const { ctx, sent } = createMsgCtx(); // no authorizeMessage

    await handleMessage(ctx, { type: "message", topic: "api.chat.send#abc", payload: "hi" });

    expect(sent).toHaveLength(0); // No error, message processed
  });
});
