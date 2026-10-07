/**
 * Unit tests for `createProxyWSChannelFactory` and `createProxyWSPushFactory`.
 *
 * Validation lives in `resolveProxyPath`: factories construct
 * unconditionally and only fail at the first `connect` call. Tests assert
 * that failure surface, plus the topic-building / dispatch contracts.
 *
 * Mocks `executeWSChannel` / `executeWSPush` at the module boundary so we
 * exercise URL plumbing, topic building, and dispatch logic without
 * opening real WebSocket connections.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/realtime/ws-channel-client", () => ({
  executeWSChannel: vi.fn(() => ({
    send: vi.fn(),
    on: vi.fn(() => () => {}),
    close: vi.fn(),
    status: "connecting" as const,
  })),
}));

vi.mock("../src/realtime/ws-subscription", () => ({
  executeWSPush: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
    }),
    close: vi.fn(),
    status: "connecting" as const,
    on: vi.fn(),
  })),
}));

import { isConfigurationError } from "../src/errors";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { createProxyWSChannelFactory, createProxyWSPushFactory } from "../src/transport/proxy/ws";

const mockedChannel = vi.mocked(executeWSChannel);
const mockedPush = vi.mocked(executeWSPush);

beforeEach(() => {
  (globalThis as { location?: { protocol: string; host: string } }).location = {
    protocol: "https:",
    host: "app.example.com",
  };
});

afterEach(() => {
  mockedChannel.mockClear();
  mockedPush.mockClear();
});

// ── Construction is always safe (lazy resolution) ───────────────────────────

describe("createProxyWSChannelFactory — lazy validation", () => {
  it("constructs without throwing when proxyPath is omitted", () => {
    expect(() => createProxyWSChannelFactory("api")).not.toThrow();
  });

  it("first connect() throws WS_PATH_NOT_CONFIGURED when proxyPath.ws missing", () => {
    const factory = createProxyWSChannelFactory("api");
    let caught: unknown;
    try {
      factory("chat", "room", undefined, {});
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("WS_PATH_NOT_CONFIGURED");
  });

  it("first connect() rejects http:// scheme", () => {
    const factory = createProxyWSChannelFactory("api", { proxyPath: { ws: "http://x" } });
    expect(() => factory("chat", "room", undefined, {})).toThrow(/ws:\/\/ or wss:\/\//);
  });

  it("first connect() rejects https:// scheme", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "https://example.com/ws" },
    });
    expect(() => factory("chat", "room", undefined, {})).toThrow(/ws:\/\/ or wss:\/\//);
  });

  it("first connect() accepts ws:// URL", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "ws://localhost:3000/ws" },
    });
    expect(() => factory("chat", "room", undefined, {})).not.toThrow();
  });

  it("first connect() accepts wss:// URL", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "wss://example.com/ws" },
    });
    expect(() => factory("chat", "room", undefined, {})).not.toThrow();
  });
});

describe("createProxyWSPushFactory — lazy validation", () => {
  it("constructs without throwing when proxyPath is omitted", () => {
    expect(() => createProxyWSPushFactory("api")).not.toThrow();
  });

  it("first connect() throws WS_PATH_NOT_CONFIGURED when proxyPath.ws missing", () => {
    const factory = createProxyWSPushFactory("api");
    let caught: unknown;
    try {
      factory("notifications", "feed", undefined, {});
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe("WS_PATH_NOT_CONFIGURED");
  });

  it("first connect() rejects http:// scheme", () => {
    const factory = createProxyWSPushFactory("api", { proxyPath: { ws: "http://x" } });
    expect(() => factory("notifications", "feed", undefined, {})).toThrow(/ws:\/\/ or wss:\/\//);
  });

  it("first connect() accepts wss:// URL", () => {
    const factory = createProxyWSPushFactory("api", { proxyPath: { ws: "wss://x" } });
    expect(() => factory("notifications", "feed", undefined, {})).not.toThrow();
  });
});

// ── Channel factory dispatch ────────────────────────────────────────────────

describe("createProxyWSChannelFactory — dispatch", () => {
  it("calls executeWSChannel with the resolved wsUrl", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "ws://localhost/ws" },
    });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "ws://localhost/ws",
      expect.any(String),
      undefined,
      undefined,
    );
  });

  it("builds topic as `source.group.method`", () => {
    const factory = createProxyWSChannelFactory("myApi", { proxyPath: { ws: "ws://x" } });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith("ws://x", "myApi.chat.room", undefined, undefined);
  });

  it("forwards variables to executeWSChannel", () => {
    const factory = createProxyWSChannelFactory("api", { proxyPath: { ws: "ws://x" } });
    factory("chat", "room", { roomId: "42" }, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "ws://x",
      "api.chat.room",
      { roomId: "42" },
      undefined,
    );
  });

  it("returns the WSChannel produced by executeWSChannel", () => {
    const factory = createProxyWSChannelFactory("api", { proxyPath: { ws: "ws://x" } });
    const channel = factory("chat", "room", undefined, {});

    expect(channel).toHaveProperty("send");
    expect(channel).toHaveProperty("close");
    expect(channel).toHaveProperty("status", "connecting");
  });

  it("relative ws path on https origin promotes to wss://", () => {
    const factory = createProxyWSChannelFactory("api", { proxyPath: { ws: "/api/ws" } });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "wss://app.example.com/api/ws",
      "api.chat.room",
      undefined,
      undefined,
    );
  });

  it("uses explicit origin when provided (Node / SSR scenario)", () => {
    delete (globalThis as { location?: unknown }).location;

    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "/api/ws" },
      origin: { protocol: "http:", host: "localhost:3001" },
    });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "ws://localhost:3001/api/ws",
      "api.chat.room",
      undefined,
      undefined,
    );

    // Restore for subsequent tests
    (globalThis as { location?: { protocol: string; host: string } }).location = {
      protocol: "https:",
      host: "app.example.com",
    };
  });

  it("explicit origin promotes https → wss for relative paths", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "/api/ws" },
      origin: { protocol: "https:", host: "secure.example.com" },
    });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "wss://secure.example.com/api/ws",
      "api.chat.room",
      undefined,
      undefined,
    );
  });

  // ── Studio Playground correlation: _playground_rid query param ────────────

  it("appends `_playground_rid=<id>` to wsUrl when playgroundRequestId is set", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "ws://localhost:3001/api/ws" },
      playgroundRequestId: "playground-rid-channel-1",
    });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "ws://localhost:3001/api/ws?_playground_rid=playground-rid-channel-1",
      "api.chat.room",
      undefined,
      undefined,
    );
  });

  it("does NOT append the query param when playgroundRequestId is undefined", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "ws://localhost:3001/api/ws" },
    });
    factory("chat", "room", undefined, {});

    expect(mockedChannel).toHaveBeenCalledWith(
      "ws://localhost:3001/api/ws",
      "api.chat.room",
      undefined,
      undefined,
    );
  });

  it("playground rid coexists with other query params on the proxyPath.ws value", () => {
    const factory = createProxyWSChannelFactory("api", {
      proxyPath: { ws: "ws://localhost:3001/api/ws?region=eu" },
      playgroundRequestId: "rid-coexist",
    });
    factory("chat", "room", undefined, {});

    const callArg = mockedChannel.mock.calls[0]![0] as string;
    expect(callArg).toContain("region=eu");
    expect(callArg).toContain("_playground_rid=rid-coexist");
  });
});

// ── Push factory dispatch ───────────────────────────────────────────────────

describe("the caller's ws options", () => {
  it("reach the channel's connection, auth as its credentials, the same for every channel", () => {
    const ws = { auth: { token: "t" }, backoff: { initialMs: 50 } };
    const factory = createProxyWSChannelFactory("api", { proxyPath: { ws: "ws://x" }, ws });
    factory("chat", "room", undefined, {});
    factory("chat", "lobby", undefined, {});

    const [first, second] = mockedChannel.mock.calls.map((call) => call[3]);
    expect(first).toEqual({ backoff: { initialMs: 50 }, credentials: expect.any(Function) });
    expect(second).toBe(first);
  });

  it("reach the push subscription's connection", () => {
    const ws = { backoff: { initialMs: 50 } };
    const factory = createProxyWSPushFactory("api", { proxyPath: { ws: "ws://x" }, ws });
    factory("notifications", "feed", undefined, {});

    expect(mockedPush).toHaveBeenCalledWith("ws://x", "api.notifications.feed", undefined, ws);
  });
});

describe("createProxyWSPushFactory — dispatch", () => {
  it("calls executeWSPush with the resolved wsUrl and built topic", () => {
    const factory = createProxyWSPushFactory("api", {
      proxyPath: { ws: "wss://example.com/ws" },
    });
    factory("notifications", "feed", undefined, {});

    expect(mockedPush).toHaveBeenCalledWith(
      "wss://example.com/ws",
      "api.notifications.feed",
      undefined,
      undefined,
    );
  });

  it("forwards variables", () => {
    const factory = createProxyWSPushFactory("api", { proxyPath: { ws: "ws://x" } });
    factory("notifications", "feed", { since: "2020" }, {});

    expect(mockedPush).toHaveBeenCalledWith(
      "ws://x",
      "api.notifications.feed",
      { since: "2020" },
      undefined,
    );
  });

  it("returns the WSPushSubscription produced by executeWSPush", () => {
    const factory = createProxyWSPushFactory("api", { proxyPath: { ws: "ws://x" } });
    const subscription = factory("notifications", "feed", undefined, {});

    expect(subscription).toHaveProperty("close");
    expect(subscription).toHaveProperty("status", "connecting");
  });
});
