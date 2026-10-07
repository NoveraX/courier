import { afterEach, describe, expect, it, vi } from "vitest";
import type { WSSocketContext } from "../src/adapter/ws-context";
import { handleReauth, sendAuthRequired } from "../src/adapter/ws-reauth";
import type { InternalConnectionRegistry, RegistryEntry } from "../src/adapter/ws-registry-types";
import { createMemoryPubSub } from "../src/realtime/memory-pubsub";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSCredentials } from "../src/realtime/ws/ws-credentials";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import type { WSConnection } from "../src/realtime/ws/ws-types";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const HANDSHAKE = new Request("http://app.example.com/api/ws", {
  headers: { cookie: "sid=a1", origin: "http://app.example.com" },
});

function createMockCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const ctx = {
    connectionId: "conn-1",
    meta: { userId: "user-1" },
    handshake: HANDSHAKE,
    request: HANDSHAKE,
    sendMessage: (msg: WSMessage) => sent.push(msg),
    onReauth: undefined,
    registry: { updateMeta: vi.fn(), getEntry: vi.fn(() => undefined) },
    ...overrides,
  } as unknown as WSSocketContext;

  return { ctx, sent };
}

describe("handleReauth", () => {
  it("refuses credentials when no onReauth can check them, and leaves meta alone", async () => {
    const output = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctx, sent } = createMockCtx();
    await handleReauth(ctx, { type: "auth", id: "1", payload: { auth: { token: "new-jwt" } } });

    expect(ctx.meta).toEqual({ userId: "user-1" });
    expect(sent).toEqual([
      { type: "error", id: "1", error: { code: 4401, message: "Credentials rejected" } },
    ]);
    expect(output.mock.calls.some((call) => String(call[1]).includes("no onReauth"))).toBe(true);
    output.mockRestore();
  });

  it("calls onReauth with the handshake and the frame, and keeps what it returns", async () => {
    const onReauth = vi.fn().mockResolvedValue({ userId: "user-2", role: "admin" });
    const updateMeta = vi.fn();
    const { ctx, sent } = createMockCtx({
      onReauth,
      registry: {
        updateMeta,
        getEntry: vi.fn(() => undefined),
      } as unknown as InternalConnectionRegistry,
    });

    await handleReauth(ctx, {
      type: "auth",
      id: "2",
      payload: { headers: { authorization: "Bearer fresh-jwt" }, auth: { tenant: "t1" } },
    });

    const info = onReauth.mock.calls[0]![0];
    expect(info.connectionId).toBe("conn-1");
    expect(info.auth).toEqual({ tenant: "t1" });
    expect(info.request.headers.get("authorization")).toBe("Bearer fresh-jwt");
    expect(info.request.headers.get("cookie")).toBe("sid=a1");
    expect(ctx.request.headers.get("authorization")).toBe("Bearer fresh-jwt");
    expect(updateMeta).toHaveBeenCalledWith("conn-1", expect.objectContaining({ role: "admin" }));
    expect(sent[0]!.type).toBe("auth");
  });

  it("takes no cookie, origin or forwarding header from the frame", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onReauth = vi.fn().mockResolvedValue({});
    const { ctx } = createMockCtx({ onReauth });

    await handleReauth(ctx, {
      type: "auth",
      payload: {
        headers: {
          cookie: "sid=mallory",
          origin: "http://evil.example",
          "x-forwarded-for": "1.2.3.4",
        },
      },
    });

    const request: Request = onReauth.mock.calls[0]![0].request;
    expect(request.headers.get("cookie")).toBe("sid=a1");
    expect(request.headers.get("origin")).toBe("http://app.example.com");
    expect(request.headers.has("x-forwarded-for")).toBe(false);
  });

  it("bails out without mutating meta when ctx.closed flips during onReauth", async () => {
    let ctxRef!: WSSocketContext;
    const onReauth = vi.fn(async () => {
      (ctxRef as { closed: boolean }).closed = true;
      return { userId: "user-2", role: "admin" };
    });
    const updateMeta = vi.fn();
    const { ctx, sent } = createMockCtx({
      onReauth,
      registry: { updateMeta } as unknown as InternalConnectionRegistry,
    });
    ctxRef = ctx;

    await handleReauth(ctx, { type: "auth", id: "x", payload: { auth: { token: "fresh" } } });

    expect(updateMeta).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect((ctx.meta as Record<string, unknown>).role).toBeUndefined();
  });

  it("bails out without sendMessage when ctx.closed flips and handler throws", async () => {
    let ctxRef!: WSSocketContext;
    const onReauth = vi.fn(async () => {
      (ctxRef as { closed: boolean }).closed = true;
      throw new Error("expired");
    });
    const { ctx, sent } = createMockCtx({ onReauth });
    ctxRef = ctx;

    await handleReauth(ctx, { type: "auth", id: "x", payload: { auth: { token: "bad" } } });

    expect(sent).toHaveLength(0);
  });

  it("sends 4401 and does not update meta when handler throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onReauth = vi.fn().mockRejectedValue(new Error("expired"));
    const updateMeta = vi.fn();
    const { ctx, sent } = createMockCtx({
      onReauth,
      registry: { updateMeta } as unknown as InternalConnectionRegistry,
    });

    await handleReauth(ctx, { type: "auth", id: "3", payload: { auth: { token: "bad-jwt" } } });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4401);
    expect(updateMeta).not.toHaveBeenCalled();
  });

  it("answers a payload no client sends with 4400", async () => {
    const { ctx, sent } = createMockCtx();
    await handleReauth(ctx, { type: "auth", id: "4", payload: "a-bare-token" });
    await handleReauth(ctx, { type: "auth", id: "5", payload: { headers: { authorization: 1 } } });

    expect(sent.map((m) => m.error?.code)).toEqual([4400, 4400]);
  });
});

describe("sendAuthRequired", () => {
  it("sends auth_required to connection", () => {
    const sendRaw = vi.fn();
    const close = vi.fn();
    const entry: RegistryEntry = {
      connectionId: "c1",
      meta: {},
      connectedAt: 0,
      sendRaw,
      sendEncoded: vi.fn(),
      close,
    };
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
    const entry: RegistryEntry = {
      connectionId: "c1",
      meta: {},
      connectedAt: 0,
      sendRaw: vi.fn(),
      sendEncoded: vi.fn(),
      close,
    };
    const registry = { getEntry: vi.fn(() => entry) } as unknown as InternalConnectionRegistry;

    const cancel = sendAuthRequired(registry, "c1", 50);
    expect(cancel).toBeDefined();

    await new Promise((r) => setTimeout(r, 80));
    expect(close).toHaveBeenCalledWith(4401, "Auth timeout — credentials not sent again");
  });

  it("cancel function prevents timeout disconnect", async () => {
    const close = vi.fn();
    const entry: RegistryEntry = {
      connectionId: "c1",
      meta: {},
      connectedAt: 0,
      sendRaw: vi.fn(),
      sendEncoded: vi.fn(),
      close,
    };
    const registry = { getEntry: vi.fn(() => entry) } as unknown as InternalConnectionRegistry;

    const cancel = sendAuthRequired(registry, "c1", 50);
    cancel!();

    await new Promise((r) => setTimeout(r, 80));
    expect(close).not.toHaveBeenCalled();
  });
});

describe("credentials the server asks a connected client for again", () => {
  let served: ServedWS | undefined;
  let client: WSConnection | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    client?.close();
    client = undefined;
    await stopWS(served);
    served = undefined;
  });

  async function connect(credentials?: () => WSCredentials): Promise<string> {
    client = createWSConnection({ url: served!.url, credentials });
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

  it("keeps the connection open once the client has sent ones the server accepts", async () => {
    const seen: unknown[] = [];
    served = await serveWS(
      {},
      {
        onReauth: ({ auth }) => {
          seen.push(auth);
          return { user: auth?.token };
        },
      },
    );
    let issued = 0;
    const connectionId = await connect(() => ({ frame: { auth: { token: `t${++issued}` } } }));

    sendAuthRequired(served.handler.connections, connectionId, 200);
    await settle(400);

    expect(seen).toEqual([{ token: "t2" }]);
    expect(client?.status).toBe("connected");
    expect(served.handler.connections.get(connectionId)?.meta).toEqual({ user: "t2" });
  });

  it("closes the connection when no credentials come in time", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS({}, { onReauth: ({ auth }) => ({ user: auth?.token }) });
    const connectionId = await connect();

    sendAuthRequired(served.handler.connections, connectionId, 100);
    await settle(300);

    expect(served.handler.connections.count).toBe(0);
    expect(client?.status).toBe("disconnected");
  });

  it("closes the connection at the deadline when no onReauth can accept them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS({}, {});
    const connectionId = await connect(() => ({ frame: { auth: { token: "any" } } }));

    sendAuthRequired(served.handler.connections, connectionId, 150);
    await settle(400);

    expect(served.handler.connections.count).toBe(0);
    expect(client?.status).toBe("disconnected");
  });

  it("is asked for through the registry of a handler with a pub/sub adapter", async () => {
    const pubsub = createMemoryPubSub("replica");
    await pubsub.connect();
    served = await serveWS({}, { pubsub, onReauth: ({ auth }) => ({ user: auth?.token }) });
    const connectionId = await connect(() => ({ frame: { auth: { token: "fresh" } } }));

    sendAuthRequired(served.handler.connections, connectionId, 200);
    await settle(400);

    expect(served.handler.connections.get(connectionId)?.meta).toEqual({ user: "fresh" });
  });
});
