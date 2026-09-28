import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTokenRefresh, sendAuthRequired } from "../src/adapter/ws-token-refresh";
import type { WSSocketContext } from "../src/adapter/ws-context";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import type { InternalConnectionRegistry, RegistryEntry } from "../src/adapter/ws-registry-types";
import { createMemoryPubSub } from "../src/realtime/memory-pubsub";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSConnection } from "../src/realtime/ws/ws-types";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

function createMockCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const ctx = {
    connectionId: "conn-1",
    meta: { userId: "user-1" },
    sendMessage: (msg: WSMessage) => sent.push(msg),
    onTokenRefresh: undefined,
    registry: { updateMeta: vi.fn(), getEntry: vi.fn(() => undefined) },
    ...overrides,
  } as unknown as WSSocketContext;

  return { ctx, sent };
}

describe("handleTokenRefresh", () => {
  it("rejects missing token with 4400", async () => {
    const { ctx, sent } = createMockCtx();
    await handleTokenRefresh(ctx, { type: "auth", id: "1" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4400);
  });

  it("accepts token and stores in meta when no handler configured", async () => {
    const { ctx, sent } = createMockCtx();
    await handleTokenRefresh(ctx, { type: "auth", id: "1", payload: "new-jwt" });

    expect(ctx.meta.token).toBe("new-jwt");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("auth");
    expect(sent[0]!.id).toBe("1");
  });

  it("calls onTokenRefresh and updates meta on success", async () => {
    const onTokenRefresh = vi.fn().mockResolvedValue({ userId: "user-2", role: "admin" });
    const updateMeta = vi.fn();
    const { ctx, sent } = createMockCtx({
      onTokenRefresh,
      registry: { updateMeta, getEntry: vi.fn(() => undefined) } as unknown as InternalConnectionRegistry,
    });

    await handleTokenRefresh(ctx, { type: "auth", id: "2", payload: "fresh-jwt" });

    expect(onTokenRefresh).toHaveBeenCalledOnce();
    expect(onTokenRefresh.mock.calls[0]![0].token).toBe("fresh-jwt");
    expect(onTokenRefresh.mock.calls[0]![0].connectionId).toBe("conn-1");
    expect(updateMeta).toHaveBeenCalledWith("conn-1", expect.objectContaining({ role: "admin" }));
    expect(sent[0]!.type).toBe("auth");
  });

  it("bails out without mutating meta when ctx.closed flips during onTokenRefresh", async () => {
    let ctxRef!: WSSocketContext;
    const onTokenRefresh = vi.fn(async () => {
      (ctxRef as { closed: boolean }).closed = true;
      return { userId: "user-2", role: "admin" };
    });
    const updateMeta = vi.fn();
    const { ctx, sent } = createMockCtx({
      onTokenRefresh,
      registry: { updateMeta } as unknown as InternalConnectionRegistry,
    });
    ctxRef = ctx;

    await handleTokenRefresh(ctx, { type: "auth", id: "x", payload: "fresh-jwt" });

    expect(updateMeta).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect((ctx.meta as Record<string, unknown>).role).toBeUndefined();
  });

  it("bails out without sendMessage when ctx.closed flips and handler throws", async () => {
    let ctxRef!: WSSocketContext;
    const onTokenRefresh = vi.fn(async () => {
      (ctxRef as { closed: boolean }).closed = true;
      throw new Error("expired");
    });
    const { ctx, sent } = createMockCtx({ onTokenRefresh });
    ctxRef = ctx;

    await handleTokenRefresh(ctx, { type: "auth", id: "x", payload: "bad" });

    expect(sent).toHaveLength(0);
  });

  it("sends 4401 and does not update meta when handler throws", async () => {
    const onTokenRefresh = vi.fn().mockRejectedValue(new Error("expired"));
    const updateMeta = vi.fn();
    const { ctx, sent } = createMockCtx({
      onTokenRefresh,
      registry: { updateMeta } as unknown as InternalConnectionRegistry,
    });

    await handleTokenRefresh(ctx, { type: "auth", id: "3", payload: "bad-jwt" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4401);
    expect(updateMeta).not.toHaveBeenCalled();
  });

  it("rejects non-string payload with 4400", async () => {
    const { ctx, sent } = createMockCtx();
    await handleTokenRefresh(ctx, { type: "auth", id: "4", payload: { nested: true } });

    expect(sent[0]!.error?.code).toBe(4400);
  });
});

describe("sendAuthRequired", () => {
  it("sends auth_required to connection", () => {
    const sendRaw = vi.fn();
    const close = vi.fn();
    const entry: RegistryEntry = { connectionId: "c1", meta: {}, connectedAt: 0, sendRaw, sendEncoded: vi.fn(), close };
    const registry = { getEntry: vi.fn(() => entry) } as unknown as InternalConnectionRegistry;

    sendAuthRequired(registry, "c1", 0);

    expect(sendRaw).toHaveBeenCalledOnce();
    const msg = sendRaw.mock.calls[0]![0] as WSMessage;
    expect(msg.type).toBe("auth_required");
  });

  it("returns undefined for unknown connection", () => {
    const registry = { getEntry: vi.fn(() => undefined) } as unknown as InternalConnectionRegistry;
    const result = sendAuthRequired(registry, "unknown");
    expect(result).toBeUndefined();
  });

  it("disconnects after timeout if no refresh", async () => {
    const close = vi.fn();
    const entry: RegistryEntry = { connectionId: "c1", meta: {}, connectedAt: 0, sendRaw: vi.fn(), sendEncoded: vi.fn(), close };
    const registry = { getEntry: vi.fn(() => entry) } as unknown as InternalConnectionRegistry;

    const cancel = sendAuthRequired(registry, "c1", 50);
    expect(cancel).toBeDefined();

    await new Promise((r) => setTimeout(r, 80));
    expect(close).toHaveBeenCalledWith(4401, "Auth timeout — token not refreshed");
  });

  it("cancel function prevents timeout disconnect", async () => {
    const close = vi.fn();
    const entry: RegistryEntry = { connectionId: "c1", meta: {}, connectedAt: 0, sendRaw: vi.fn(), sendEncoded: vi.fn(), close };
    const registry = { getEntry: vi.fn(() => entry) } as unknown as InternalConnectionRegistry;

    const cancel = sendAuthRequired(registry, "c1", 50);
    cancel!();

    await new Promise((r) => setTimeout(r, 80));
    expect(close).not.toHaveBeenCalled();
  });
});

describe("a token the server asks a connected client for", () => {
  let served: ServedWS | undefined;
  let client: WSConnection | undefined;

  afterEach(async () => {
    client?.close();
    client = undefined;
    await stopWS(served);
    served = undefined;
  });

  async function connect(getAuthToken?: () => string): Promise<string> {
    client = createWSConnection({ url: served!.url, getAuthToken });
    await new Promise<void>((resolve) => {
      const stop = client!.onStatusChange((status) => {
        if (status !== "connected") return;
        stop();
        resolve();
      });
    });
    await settle(20);
    return served!.handler.connections.list()[0]!.connectionId;
  }

  it("keeps the connection open once the client has answered with one the server accepts", async () => {
    const refreshed: string[] = [];
    served = await serveWS(
      {},
      {
        onTokenRefresh: ({ token }) => {
          refreshed.push(token);
          return { user: token };
        },
      },
    );
    const connectionId = await connect(() => "fresh-token");

    sendAuthRequired(served.handler.connections, connectionId, 200);
    await settle(400);

    expect(refreshed).toEqual(["fresh-token"]);
    expect(client?.status).toBe("connected");
    expect(served.handler.connections.get(connectionId)?.meta).toEqual({ user: "fresh-token" });
  });

  it("closes the connection when no token comes in time", async () => {
    served = await serveWS({}, { onTokenRefresh: ({ token }) => ({ user: token }) });
    const connectionId = await connect();

    sendAuthRequired(served.handler.connections, connectionId, 100);
    await settle(300);

    expect(served.handler.connections.count).toBe(0);
    expect(client?.status).toBe("disconnected");
  });

  it("is asked for through the registry of a handler with a pub/sub adapter", async () => {
    const pubsub = createMemoryPubSub("replica");
    await pubsub.connect();
    served = await serveWS({}, { pubsub, onTokenRefresh: ({ token }) => ({ user: token }) });
    const connectionId = await connect(() => "fresh-token");

    sendAuthRequired(served.handler.connections, connectionId, 200);
    await settle(400);

    expect(served.handler.connections.get(connectionId)?.meta).toEqual({ user: "fresh-token" });
  });
});
