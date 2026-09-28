/**
 * A WS message whose handler rejects — an auth throw, a schema crash, a
 * registry race — is logged at error with the message type and the
 * rejection itself, stack included, and never escapes as an
 * unhandledRejection on the process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/adapter/ws-message", () => ({
  handleMessage: vi.fn(),
  handleUnsubscribe: vi.fn(),
}));

vi.mock("../src/adapter/ws-subscribe", () => ({
  handleSubscribe: vi.fn(),
}));

vi.mock("../src/adapter/ws-token-refresh", () => ({
  handleTokenRefresh: vi.fn(),
}));

import { handleMessage, handleUnsubscribe } from "../src/adapter/ws-message";
import { handleSubscribe } from "../src/adapter/ws-subscribe";
import { handleTokenRefresh } from "../src/adapter/ws-token-refresh";
import { wireEvents } from "../src/adapter/ws-lifecycle";
import type { WSSocketContext } from "../src/adapter/ws-context";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";

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
  };
}

function createMockCtx(): WSSocketContext {
  const sent: WSMessage[] = [];
  return {
    connectionId: "conn-1",
    sendMessage: (msg: WSMessage) => sent.push(msg),
    dt: {},
    seq: { value: 0 },
    subscriptionIds: new Map(),
    subscribing: new Map(),
    t0: 0,
    meta: {},
    maxMessageSize: 65536,
    maxMessagesPerSecond: 100,
    rateLimitBucket: { tokens: 100, lastRefillAt: Date.now() },
    maxControlPerSecond: 200,
    controlBucket: { tokens: 200, lastRefillAt: Date.now() },
    clientIP: "127.0.0.1",
  } as unknown as WSSocketContext;
}

const config = { sources: {} } as WSHandlerConfig;
const heartbeat = { start: vi.fn(), stop: vi.fn(), receivedPong: vi.fn() };
const topicManager = {
  has: vi.fn(() => false),
  topicCount: vi.fn(() => 0),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  disconnectAll: vi.fn(async () => {}),
  subscribers: vi.fn(() => []),
  size: 0,
};
const registry = { remove: vi.fn(), add: vi.fn() };

let errorSpy: ReturnType<typeof vi.spyOn>;

/** Whether an error line named the message type and carried the rejection itself. */
function loggedWith(type: string, error: Error): boolean {
  return errorSpy.mock.calls.some(
    (call: unknown[]) => String(call[1]).includes(`WS "${type}"`) && call.includes(error),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

async function flushMicrotasks(): Promise<void> {
  // Two awaits — the first lets the dispatched .catch() run, the second
  // lets any nested log scheduling resolve.
  await Promise.resolve();
  await Promise.resolve();
}

describe("ws-lifecycle dispatch — floating promise rejection handling", () => {
  it("logs and swallows handleSubscribe rejection", async () => {
    const boom = new Error("subscribe boom");
    vi.mocked(handleSubscribe).mockRejectedValueOnce(boom);

    const ws = createMockWs();
    wireEvents(
      ws as never,
      createMockCtx(),
      heartbeat as never,
      topicManager as never,
      config,
      registry as never,
    );
    ws._emit("message", {
      data: encodeMessage({ type: "subscribe", id: "s1", topic: "x.y" }),
    });
    await flushMicrotasks();

    expect(handleSubscribe).toHaveBeenCalledOnce();
    expect(loggedWith("subscribe", boom)).toBe(true);
  });

  it("logs and swallows handleUnsubscribe rejection", async () => {
    const boom = new Error("unsubscribe boom");
    vi.mocked(handleUnsubscribe).mockRejectedValueOnce(boom);

    const ws = createMockWs();
    wireEvents(
      ws as never,
      createMockCtx(),
      heartbeat as never,
      topicManager as never,
      config,
      registry as never,
    );
    ws._emit("message", {
      data: encodeMessage({ type: "unsubscribe", id: "s1", topic: "x.y" }),
    });
    await flushMicrotasks();

    expect(handleUnsubscribe).toHaveBeenCalledOnce();
    expect(loggedWith("unsubscribe", boom)).toBe(true);
  });

  it("logs and swallows handleTokenRefresh rejection", async () => {
    const boom = new Error("auth boom");
    vi.mocked(handleTokenRefresh).mockRejectedValueOnce(boom);

    const ws = createMockWs();
    wireEvents(
      ws as never,
      createMockCtx(),
      heartbeat as never,
      topicManager as never,
      config,
      registry as never,
    );
    ws._emit("message", {
      data: encodeMessage({ type: "auth", token: "tok" } as never),
    });
    await flushMicrotasks();

    expect(handleTokenRefresh).toHaveBeenCalledOnce();
    expect(loggedWith("auth", boom)).toBe(true);
  });

  it("logs and swallows handleMessage rejection", async () => {
    const boom = new Error("message boom");
    vi.mocked(handleMessage).mockRejectedValueOnce(boom);

    const ws = createMockWs();
    wireEvents(
      ws as never,
      createMockCtx(),
      heartbeat as never,
      topicManager as never,
      config,
      registry as never,
    );
    ws._emit("message", {
      data: encodeMessage({ type: "message", id: "m1", topic: "x.y", payload: {} } as never),
    });
    await flushMicrotasks();

    expect(handleMessage).toHaveBeenCalledOnce();
    expect(loggedWith("message", boom)).toBe(true);
  });
});
