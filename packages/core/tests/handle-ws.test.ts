import { afterEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { parseTopic } from "../src/adapter/ws-resolve";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import type { Sources } from "../src/define/types";
import type { WebSocketLike } from "../src/realtime/adapters";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { ENDPOINT_SCHEMA } from "../src/validation";

afterEach(() => {
  _resetSourcesForTests();
});

/**
 * Zero-arg `createWSHandler()` reads sources lazily from the core global
 * registry. Tests register sources first, then create the handler with
 * just the behavioral options, so the request-time `requireSources()`
 * lookup inside `buildContext()` returns the expected dict.
 */
function setupWSHandler(sources: Sources, options?: WSHandlerConfig) {
  registerSources(sources);
  return createWSHandler(options);
}

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type MockSocket = WebSocketLike & {
  _sent: WSMessage[];
  _closed: { code?: number | undefined; reason?: string | undefined } | null;
  _emit: (type: string, data?: unknown) => void;
};

function createMockSocket(): MockSocket {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const sent: WSMessage[] = [];
  let readyState = 1;
  let closed: { code?: number | undefined; reason?: string | undefined } | null = null;

  return {
    get readyState() {
      return readyState;
    },
    get bufferedAmount() {
      return 0;
    },
    get _sent() {
      return sent;
    },
    get _closed() {
      return closed;
    },
    send(data: string) {
      sent.push(JSON.parse(data) as WSMessage);
    },
    close(code?: number, reason?: string) {
      closed = { code, reason };
      readyState = 3;
    },
    addEventListener(type: string, handler: (event: never) => void) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)?.push(handler as (event: unknown) => void);
    },
    _emit(type: string, data?: unknown) {
      for (const h of listeners.get(type) ?? []) {
        h(data);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Sources
// ---------------------------------------------------------------------------

function createWSSource(handler: unknown, transport: "ws" = "ws", receive?: unknown): Sources {
  const schema = { transport, ...(receive ? { receive } : {}) };
  const fn = {
    [ENDPOINT_SCHEMA]: schema,
    kind: "channel",
    method: "get",
    path: "",
    probe: handler,
    served: true,
    options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
  } as unknown as Record<symbol, unknown>;

  return {
    testSource: {
      options: {
        groups: {
          chat: {
            endpoints: { feed: fn },
            options: {},
            feed: fn,
          },
        },
      },
      chat: { feed: handler },
      feed: fn,
    },
  } as unknown as Sources;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createWSHandler", () => {
  /** A rebound page's socket is same-origin to it; only the host tells. */
  it("closes a socket opened on a host the app does not serve with 4421", () => {
    vi.stubEnv("NODE_ENV", "development");
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {});

    const ws = createMockSocket();
    handleSocket(
      ws,
      new Request("http://rebound.example:3000/ws", {
        headers: { Origin: "http://rebound.example:3000" },
      }),
    );

    expect(ws._closed).toEqual({ code: 4421, reason: "Host not allowed" });
    vi.unstubAllEnvs();
  });

  it("keeps a socket opened on a host allowedHosts lists", () => {
    vi.stubEnv("NODE_ENV", "development");
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, { allowedHosts: ["app.example.com"] });

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://app.example.com/ws"));

    expect(ws._closed).toBeNull();
    vi.unstubAllEnvs();
  });

  it("rejects connections with invalid origin", () => {
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      allowedOrigins: ["http://localhost:3000"],
    });

    const ws = createMockSocket();
    const req = new Request("http://localhost/ws", {
      headers: { Origin: "http://evil.com" },
    });

    handleSocket(ws, req);
    expect(ws._closed).toEqual({ code: 4403, reason: "Origin not allowed" });
  });

  it("allows connections with valid origin", () => {
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      allowedOrigins: ["http://localhost:3000"],
    });

    const ws = createMockSocket();
    const req = new Request("http://localhost/ws", {
      headers: { Origin: "http://localhost:3000" },
    });

    handleSocket(ws, req);
    expect(ws._closed).toBeNull();
  });

  it("allows playground proxy WS upgrade with no Origin header when _playground_rid query is present even with allowedOrigins set", async () => {
    // The Studio Playground proxy executor runs inside the user-app's Node
    // process. Node's global `WebSocket` (undici) does NOT send an Origin
    // header — it's a browser-only concept. Without this bypass the upgrade
    // would be rejected with 4403 even though the request originates from a
    // trusted in-process Studio executor that already passed the playground
    // correlation id (`_playground_rid` query). Browsers always send Origin,
    // so this combination cannot be triggered from a malicious page.
    const { clearPlaygroundAbortRegistry } = await import("../src/studio");
    clearPlaygroundAbortRegistry();

    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      allowedOrigins: ["http://localhost:3000"],
    });

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws?_playground_rid=rid-bypass-1"));

    expect(ws._closed).toBeNull();
    clearPlaygroundAbortRegistry();
  });

  it("still rejects connections with mismatched Origin even when _playground_rid is present (browser CSRF)", () => {
    // A malicious page that tries to forge a playground request from a
    // browser will ALWAYS carry an Origin header (browser spec requirement),
    // so the bypass must NOT apply when Origin is set. Validate normally.
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      allowedOrigins: ["http://localhost:3000"],
    });

    const ws = createMockSocket();
    handleSocket(
      ws,
      new Request("http://localhost/ws?_playground_rid=rid-csrf", {
        headers: { Origin: "http://evil.com" },
      }),
    );

    expect(ws._closed).toEqual({ code: 4403, reason: "Origin not allowed" });
  });

  // ── Studio Playground abort registry integration ──────────────────────────

  it("registers in playground abort registry when upgrade URL has _playground_rid, and abortPlayground closes the socket", async () => {
    const { abortPlayground, playgroundAbortRegistrySize, clearPlaygroundAbortRegistry } =
      await import("../src/studio");
    clearPlaygroundAbortRegistry();

    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    const req = new Request("http://localhost/ws?_playground_rid=rid-ws-cancel-1");

    handleSocket(ws, req);
    expect(playgroundAbortRegistrySize()).toBe(1);
    expect(ws._closed).toBeNull();

    // Force-abort via the registry — simulates the playground executor's
    // onAbort branch in the same process.
    expect(abortPlayground("rid-ws-cancel-1")).toBe(true);
    expect(ws._closed).toEqual({
      code: 1000,
      reason: "Cancelled by Studio Playground",
    });

    // Fire the close event to trigger cleanup unregister.
    ws._emit("close", { code: 1000, reason: "Cancelled by Studio Playground" });
    // Wait a microtask for the async close handler to complete.
    await new Promise((r) => setTimeout(r, 0));
    expect(playgroundAbortRegistrySize()).toBe(0);

    clearPlaygroundAbortRegistry();
  });

  it("does NOT register in playground abort registry when _playground_rid is malformed", async () => {
    const { clearPlaygroundAbortRegistry, playgroundAbortRegistrySize } = await import(
      "../src/studio"
    );
    clearPlaygroundAbortRegistry();
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources);

    handleSocket(createMockSocket(), new Request("http://localhost/ws?_playground_rid=bad%20id"));

    expect(playgroundAbortRegistrySize()).toBe(0);
    clearPlaygroundAbortRegistry();
  });

  it("does NOT register in playground abort registry when upgrade URL has no _playground_rid", async () => {
    const { playgroundAbortRegistrySize, clearPlaygroundAbortRegistry } = await import(
      "../src/studio"
    );
    clearPlaygroundAbortRegistry();

    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    expect(playgroundAbortRegistrySize()).toBe(0);
  });

  it("close event unregisters the playground abort entry on its own", async () => {
    const { abortPlayground, playgroundAbortRegistrySize, clearPlaygroundAbortRegistry } =
      await import("../src/studio");
    clearPlaygroundAbortRegistry();

    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws?_playground_rid=rid-ws-natural-close"));
    expect(playgroundAbortRegistrySize()).toBe(1);

    // Natural client-side close (not via registry) — close listener should
    // still unregister the entry so the registry doesn't leak.
    ws._emit("close", { code: 1006, reason: "" });
    await new Promise((r) => setTimeout(r, 0));

    expect(playgroundAbortRegistrySize()).toBe(0);
    // Subsequent abortPlayground calls are no-ops.
    expect(abortPlayground("rid-ws-natural-close")).toBe(false);
  });

  it("sends ping messages for heartbeat", async () => {
    vi.useFakeTimers();
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 50,
    });

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    // First message is stream:open hook related, skip to heartbeat
    ws._sent.length = 0;

    vi.advanceTimersByTime(100);
    expect(ws._sent.some((m) => m.type === "ping")).toBe(true);

    vi.useRealTimers();
  });

  it("handles pong messages to reset heartbeat", () => {
    vi.useFakeTimers();
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 50,
    });

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    vi.advanceTimersByTime(100);
    // Send pong — should not close
    ws._emit("message", { data: encodeMessage({ type: "pong" }) });

    vi.advanceTimersByTime(100);
    // Still open after another interval + pong
    expect(ws._closed).toBeNull();

    vi.useRealTimers();
  });

  it("closes connection on heartbeat timeout", () => {
    vi.useFakeTimers();
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources, {
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 50,
    });

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    // Advance past heartbeat interval — ping sent
    vi.advanceTimersByTime(100);
    expect(ws._sent.some((m) => m.type === "ping")).toBe(true);

    // Do NOT send pong — advance past timeout
    vi.advanceTimersByTime(50);
    expect(ws._closed).toEqual({ code: 4408, reason: "Heartbeat timeout" });

    vi.useRealTimers();
  });

  it("handles subscribe to push endpoint", async () => {
    const pushHandler = async function* () {
      yield "msg-1";
      yield "msg-2";
    };

    const sources = createWSSource(pushHandler);
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "sub-1", topic: "testSource.chat.feed" }),
    });

    // Allow async generator to iterate
    await new Promise((r) => setTimeout(r, 50));

    const subscribed = ws._sent.find((m) => m.type === "subscribed");
    expect(subscribed).toBeDefined();
    expect(subscribed!.topic).toBe("testSource.chat.feed");

    const dataMessages = ws._sent.filter((m) => m.type === "data");
    expect(dataMessages).toHaveLength(2);
    expect(dataMessages[0]?.payload).toBe("msg-1");
    expect(dataMessages[1]?.payload).toBe("msg-2");
  });

  it("rejects subscribe to non-WS endpoint", () => {
    const httpHandler = vi.fn();
    const sources = createWSSource(httpHandler, "http" as "ws");
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "sub-1", topic: "testSource.chat.feed" }),
    });

    const refused = ws._sent.find((m) => m.type === "complete");
    expect(refused).toMatchObject({ topic: "testSource.chat.feed", id: "sub-1" });
    expect(refused!.error?.code).toBe(4403);
  });

  it("resubscribe to same topic succeeds (reconnect dedup)", async () => {
    const pushHandler = async function* () {
      yield "msg-1";
      await new Promise(() => {});
    };

    const sources = createWSSource(pushHandler);
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "sub-1", topic: "testSource.chat.feed" }),
    });
    await new Promise((r) => setTimeout(r, 10));

    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "sub-2", topic: "testSource.chat.feed" }),
    });
    await new Promise((r) => setTimeout(r, 10));

    const subscribed = ws._sent.filter((m) => m.type === "subscribed");
    expect(subscribed).toHaveLength(2);
    const errors = ws._sent.filter((m) => m.type === "error" && m.error?.code === 4409);
    expect(errors).toHaveLength(0);
  });

  it("handles unsubscribe", async () => {
    const pushHandler = async function* () {
      await new Promise(() => {});
    };

    const sources = createWSSource(pushHandler);
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "sub-1", topic: "testSource.chat.feed" }),
    });
    await new Promise((r) => setTimeout(r, 10));

    ws._emit("message", {
      data: encodeMessage({ type: "unsubscribe", id: "unsub-1", topic: "testSource.chat.feed" }),
    });
    await new Promise((r) => setTimeout(r, 10));

    const unsub = ws._sent.find((m) => m.type === "unsubscribed");
    expect(unsub).toBeDefined();
    expect(unsub!.topic).toBe("testSource.chat.feed");
  });

  it("rejects invalid JSON messages", () => {
    const sources = createWSSource(vi.fn());
    const { handleSocket } = setupWSHandler(sources);

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    ws._emit("message", { data: "not-json{{{" });

    const error = ws._sent.find((m) => m.type === "error" && m.error?.code === 4400);
    expect(error).toBeDefined();
  });

  it("cleans up on socket close", async () => {
    vi.useFakeTimers();
    const pushHandler = async function* () {
      await new Promise(() => {});
    };

    const sources = createWSSource(pushHandler);
    const { handleSocket } = setupWSHandler(sources, {
      heartbeatIntervalMs: 100,
    });

    const ws = createMockSocket();
    handleSocket(ws, new Request("http://localhost/ws"));

    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "sub-1", topic: "testSource.chat.feed" }),
    });

    await vi.advanceTimersByTimeAsync(10);

    ws._emit("close", { code: 1000 });

    // Heartbeat should be stopped — no more pings after close
    ws._sent.length = 0;
    vi.advanceTimersByTime(200);
    expect(ws._sent.filter((m) => m.type === "ping")).toHaveLength(0);

    vi.useRealTimers();
  });
});

describe("createWSHandler — connections registry", () => {
  it("exposes connections property", () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);
    expect(handler.connections).toBeDefined();
    expect(handler.connections.count).toBe(0);
  });

  it("tracks connections after handleSocket", () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);

    handler.handleSocket(createMockSocket(), new Request("http://localhost/ws"));
    handler.handleSocket(createMockSocket(), new Request("http://localhost/ws"));

    expect(handler.connections.count).toBe(2);
    expect(handler.connections.list()).toHaveLength(2);
  });

  it("removes connection on close", async () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);

    const ws = createMockSocket();
    handler.handleSocket(ws, new Request("http://localhost/ws"));
    expect(handler.connections.count).toBe(1);

    ws._emit("close", { code: 1000 });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler.connections.count).toBe(0);
  });

  it("does not register rejected connections", () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources, {
      allowedOrigins: ["http://allowed.com"],
    });

    const ws = createMockSocket();
    handler.handleSocket(
      ws,
      new Request("http://localhost/ws", {
        headers: { Origin: "http://evil.com" },
      }),
    );

    expect(handler.connections.count).toBe(0);
  });

  it("does not register connections rejected by onConnect", async () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources, {
      onConnect: () => {
        throw new Error("rejected");
      },
    });

    const ws = createMockSocket();
    handler.handleSocket(ws, new Request("http://localhost/ws"));
    await new Promise((r) => setTimeout(r, 10));

    expect(handler.connections.count).toBe(0);
  });

  it("stores meta from onConnect", async () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources, {
      onConnect: () => ({ userId: "u42", role: "admin" }),
    });

    const ws = createMockSocket();
    handler.handleSocket(ws, new Request("http://localhost/ws"));
    ws._emit("message", { data: JSON.stringify({ type: "auth", payload: {} }) });
    await new Promise((r) => setTimeout(r, 10));

    expect(handler.connections.count).toBe(1);
    const conn = handler.connections.list()[0];
    expect(conn?.meta).toEqual({ userId: "u42", role: "admin" });
  });

  it("generates UUID connection IDs", () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);

    handler.handleSocket(createMockSocket(), new Request("http://localhost/ws"));
    handler.handleSocket(createMockSocket(), new Request("http://localhost/ws"));

    const ids = handler.connections.list().map((c) => c.connectionId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    // UUID v4 format
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it("can send to a specific connection", () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);

    const ws = createMockSocket();
    handler.handleSocket(ws, new Request("http://localhost/ws"));

    const conn = handler.connections.list()[0]!;
    handler.connections.send(conn.connectionId, { hello: "world" });

    const dataMsg = ws._sent.find((m) => m.type === "data" && m.payload);
    expect(dataMsg?.payload).toEqual({ hello: "world" });
  });

  it("can broadcast to all connections", async () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);

    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    handler.handleSocket(ws1, new Request("http://localhost/ws"));
    handler.handleSocket(ws2, new Request("http://localhost/ws"));

    await handler.connections.broadcast("ping");

    expect(ws1._sent.some((m) => m.type === "data" && m.payload === "ping")).toBe(true);
    expect(ws2._sent.some((m) => m.type === "data" && m.payload === "ping")).toBe(true);
  });

  it("can force-disconnect a connection", async () => {
    const sources = createWSSource(vi.fn());
    const handler = setupWSHandler(sources);

    const ws = createMockSocket();
    handler.handleSocket(ws, new Request("http://localhost/ws"));

    const conn = handler.connections.list()[0]!;
    handler.connections.disconnect(conn.connectionId, 4001, "Banned");

    expect(ws._closed).toEqual({ code: 4001, reason: "Banned" });
  });
});

describe("parseTopic", () => {
  it("parses source.group.method", () => {
    expect(parseTopic("api.users.getAll")).toEqual({
      source: "api",
      group: "users",
      method: "getAll",
    });
  });

  it("parses source.method", () => {
    expect(parseTopic("api.getAll")).toEqual({
      source: "api",
      group: undefined,
      method: "getAll",
    });
  });

  it("parses bare method", () => {
    expect(parseTopic("getAll")).toEqual({
      source: undefined,
      group: undefined,
      method: "getAll",
    });
  });
});
