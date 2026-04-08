/**
 * Tests for the Playground proxy executor watchdog and the Node
 * WebSocket runtime guard.
 *
 * # Watchdog (SSE + WS)
 *
 * The proxy executors install a `subscription.on("status", …)` listener
 * that detects "first-attempt connect failure": a status transition from
 * `connecting` straight to `reconnecting` without ever reaching `connected`.
 * That sequence means the very first fetch / WebSocket upgrade failed and
 * the underlying retry loop is silently looping. Without the watchdog the
 * Studio UI would hang forever in CONNECTING; with it, the user sees a
 * clean `onStreamError` with a remediation hint.
 *
 * The watchdog has three subtle invariants worth pinning down:
 *
 *  1. **Single-shot** — fires at most once, even if the loop keeps
 *     transitioning to `reconnecting` repeatedly.
 *  2. **Suppressed after success** — once `connected` was reached at least
 *     once, later `reconnecting` transitions are *legitimate* reconnects
 *     and must NOT trigger the watchdog.
 *  3. **Self-cleanup** — when the watchdog fires, it calls
 *     `subscription.close()` so the executor's drain loop unblocks and
 *     the `finally` branch unsubscribes the status listener.
 *
 * # Node WebSocket guard
 *
 * `assertGlobalWebSocket` returns a `ConfigurationError` with code
 * `NODE_WEBSOCKET_UNAVAILABLE` when `globalThis.WebSocket` is not a
 * function (Node < 21). The executor surfaces this loudly *before* trying
 * to construct the proxy factory, so the user sees actionable guidance
 * instead of a `ReferenceError` deep inside the connection loop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type createProxySSEFactory,
  type createProxyWSChannelFactory,
  isConfigurationError,
} from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { ConnectionStatus, SSESubscription, WSChannel } from "@noverax/nexus/realtime";

import { setAppOrigin } from "../src/connect/app-origin";
import { assertGlobalWebSocket } from "../src/connect/node-websocket-guard";
import { executeSSEStream } from "../src/connect/playground-sse-executor";
import { executeWSChannel } from "../src/connect/playground-ws-executor";

type ProxySSEFactoryCreator = typeof createProxySSEFactory;
type ProxyWSChannelFactoryCreator = typeof createProxyWSChannelFactory;

// ── Real-singleton hook installation ─────────────────────────────────────────

const HOOKS_KEY = Symbol.for("nexus.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as Record<string, unknown>;

const mockHooks = {
  onStreamOpen: vi.fn(),
  onStreamMessage: vi.fn(),
  onStreamClose: vi.fn(),
  onStreamError: vi.fn(),
};

beforeEach(() => {
  for (const k of Object.keys(mockHooks) as Array<keyof typeof mockHooks>) {
    mockHooks[k].mockClear();
    hooks[k] = mockHooks[k];
  }
  setAppOrigin("http://localhost:3000");
});

afterEach(() => {
  for (const k of Object.keys(mockHooks)) {
    delete hooks[k];
  }
  setAppOrigin(undefined);
});

// ── Status-drivable stub subscription / channel ─────────────────────────────
//
// The watchdog reads `subscription.on("status", handler)` exactly once and
// stores the unsubscribe in a finally block. We intercept that handler so
// each test can deterministically drive the connection state machine
// without spinning up a real network loop.

interface StatusDrivableSSE {
  subscription: SSESubscription;
  fireStatus: (status: ConnectionStatus) => void;
  unsubscribeCalled: () => boolean;
  closeCallCount: () => number;
}

function makeDrivableSSESubscription(): StatusDrivableSSE {
  let statusHandler: ((s: ConnectionStatus) => void) | undefined;
  let unsubscribeCalled = false;
  let closeCount = 0;
  let resolveNext: (() => void) | undefined;
  let closed = false;

  const subscription: SSESubscription = {
    [Symbol.asyncIterator](): AsyncIterableIterator<{ data: unknown }> {
      const iter: AsyncIterableIterator<{ data: unknown }> = {
        [Symbol.asyncIterator]() {
          return iter;
        },
        async next(): Promise<IteratorResult<{ data: unknown }>> {
          if (closed) return { done: true, value: undefined };
          await new Promise<void>((r) => {
            resolveNext = r;
          });
          return { done: true, value: undefined };
        },
      };
      return iter;
    },
    close() {
      closeCount += 1;
      closed = true;
      resolveNext?.();
    },
    status: "connecting",
    dropped: 0,
    on(_event, handler) {
      statusHandler = handler;
      return () => {
        unsubscribeCalled = true;
      };
    },
  };

  return {
    subscription,
    fireStatus: (s) => statusHandler?.(s),
    unsubscribeCalled: () => unsubscribeCalled,
    closeCallCount: () => closeCount,
  };
}

interface StatusDrivableWS {
  channel: WSChannel;
  fireStatus: (status: ConnectionStatus) => void;
  unsubscribeCalled: () => boolean;
  closeCallCount: () => number;
}

function makeDrivableWSChannel(): StatusDrivableWS {
  let statusHandler: ((s: ConnectionStatus) => void) | undefined;
  let unsubscribeCalled = false;
  let closeCount = 0;

  const channel: WSChannel = {
    send: vi.fn(),
    on: ((event: string, handler: (s: ConnectionStatus) => void) => {
      if (event === "status") {
        statusHandler = handler;
      }
      return () => {
        if (event === "status") unsubscribeCalled = true;
      };
    }) as WSChannel["on"],
    close: () => {
      closeCount += 1;
    },
    status: "connecting",
  };

  return {
    channel,
    fireStatus: (s) => statusHandler?.(s),
    unsubscribeCalled: () => unsubscribeCalled,
    closeCallCount: () => closeCount,
  };
}

// ── Source fixtures ─────────────────────────────────────────────────────────

function sourcesWith(proxyPath: { sse?: string; ws?: string }): Sources {
  return {
    api: {
      options: {
        baseURL: "https://api.example.com",
        proxyPath,
      },
    },
  } as unknown as Sources;
}

function basePayload(transport: "sse" | "ws") {
  return {
    source: "api",
    group: "chat",
    method: "stream",
    variables: undefined,
    transport,
    mode: "proxy" as const,
  };
}

// ── SSE watchdog ────────────────────────────────────────────────────────────

describe("Playground SSE watchdog", () => {
  it("fires onStreamError on connecting → reconnecting (no connected ever)", async () => {
    const drv = makeDrivableSSESubscription();
    const factoryCreator = vi.fn(() => () => drv.subscription);

    const ac = new AbortController();
    const promise = executeSSEStream(
      sourcesWith({ sse: "/api/sse" }),
      basePayload("sse"),
      "req-w1",
      ac.signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );

    // Microtask gap so the executor reaches the await loop and registers the
    // status listener before we drive transitions.
    await Promise.resolve();

    drv.fireStatus("reconnecting");
    await promise;

    expect(mockHooks.onStreamError).toHaveBeenCalledTimes(1);
    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-w1",
        error: expect.stringMatching(/Proxy SSE connection failed/),
      }),
    );
    expect(drv.closeCallCount()).toBeGreaterThanOrEqual(1);
    expect(drv.unsubscribeCalled()).toBe(true);
  });

  it("does NOT fire after a successful connect (legitimate reconnect)", async () => {
    const drv = makeDrivableSSESubscription();
    const factoryCreator = vi.fn(() => () => drv.subscription);

    const ac = new AbortController();
    const promise = executeSSEStream(
      sourcesWith({ sse: "/api/sse" }),
      basePayload("sse"),
      "req-w2",
      ac.signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );
    await Promise.resolve();

    drv.fireStatus("connected");
    drv.fireStatus("reconnecting"); // legitimate
    drv.fireStatus("connected"); // re-recovered

    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
  });

  it("is single-shot — multiple reconnecting events fire onStreamError exactly once", async () => {
    const drv = makeDrivableSSESubscription();
    const factoryCreator = vi.fn(() => () => drv.subscription);

    const promise = executeSSEStream(
      sourcesWith({ sse: "/api/sse" }),
      basePayload("sse"),
      "req-w3",
      new AbortController().signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );
    await Promise.resolve();

    drv.fireStatus("reconnecting");
    drv.fireStatus("reconnecting");
    drv.fireStatus("reconnecting");
    await promise;

    expect(mockHooks.onStreamError).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when external abort happens before any status transition", async () => {
    const drv = makeDrivableSSESubscription();
    const factoryCreator = vi.fn(() => () => drv.subscription);

    const ac = new AbortController();
    const promise = executeSSEStream(
      sourcesWith({ sse: "/api/sse" }),
      basePayload("sse"),
      "req-w4",
      ac.signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );
    await Promise.resolve();

    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
    expect(drv.unsubscribeCalled()).toBe(true);
  });

  it("ignores transitions to `disconnected` (not in the watchdog match set)", async () => {
    const drv = makeDrivableSSESubscription();
    const factoryCreator = vi.fn(() => () => drv.subscription);

    const ac = new AbortController();
    const promise = executeSSEStream(
      sourcesWith({ sse: "/api/sse" }),
      basePayload("sse"),
      "req-w5",
      ac.signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );
    await Promise.resolve();

    drv.fireStatus("disconnected"); // Should NOT trigger watchdog
    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
  });
});

// ── WS watchdog ─────────────────────────────────────────────────────────────

describe("Playground WS watchdog", () => {
  it("fires onStreamError on connecting → reconnecting (no connected ever)", async () => {
    const drv = makeDrivableWSChannel();
    const factoryCreator = vi.fn(() => () => drv.channel);

    const ac = new AbortController();
    const promise = executeWSChannel(
      sourcesWith({ ws: "ws://localhost:3001" }),
      basePayload("ws"),
      "req-ww1",
      ac.signal,
      {
        createProxyWSChannelFactory: factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );
    await Promise.resolve();

    drv.fireStatus("reconnecting");

    // Watchdog calls channel.close() which doesn't unblock the await(signal).
    // The drain loop only resolves on external abort, so we manually abort.
    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).toHaveBeenCalledTimes(1);
    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-ww1",
        error: expect.stringMatching(/Proxy WS connection failed/),
      }),
    );
    expect(drv.closeCallCount()).toBeGreaterThanOrEqual(1);
    expect(drv.unsubscribeCalled()).toBe(true);
  });

  it("does NOT fire after a successful connect (legitimate reconnect)", async () => {
    const drv = makeDrivableWSChannel();
    const factoryCreator = vi.fn(() => () => drv.channel);

    const ac = new AbortController();
    const promise = executeWSChannel(
      sourcesWith({ ws: "ws://localhost:3001" }),
      basePayload("ws"),
      "req-ww2",
      ac.signal,
      {
        createProxyWSChannelFactory: factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );
    await Promise.resolve();

    drv.fireStatus("connected");
    drv.fireStatus("reconnecting");
    drv.fireStatus("connected");

    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
  });

  it("is single-shot — multiple reconnecting events fire onStreamError exactly once", async () => {
    const drv = makeDrivableWSChannel();
    const factoryCreator = vi.fn(() => () => drv.channel);

    const ac = new AbortController();
    const promise = executeWSChannel(
      sourcesWith({ ws: "ws://localhost:3001" }),
      basePayload("ws"),
      "req-ww3",
      ac.signal,
      {
        createProxyWSChannelFactory: factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );
    await Promise.resolve();

    drv.fireStatus("reconnecting");
    drv.fireStatus("reconnecting");
    drv.fireStatus("reconnecting");

    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when external abort happens before any status transition", async () => {
    const drv = makeDrivableWSChannel();
    const factoryCreator = vi.fn(() => () => drv.channel);

    const ac = new AbortController();
    const promise = executeWSChannel(
      sourcesWith({ ws: "ws://localhost:3001" }),
      basePayload("ws"),
      "req-ww4",
      ac.signal,
      {
        createProxyWSChannelFactory: factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );
    await Promise.resolve();

    ac.abort();
    await promise;

    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
    expect(drv.unsubscribeCalled()).toBe(true);
  });
});

// ── Node WebSocket guard ────────────────────────────────────────────────────

describe("assertGlobalWebSocket", () => {
  let originalWebSocket: unknown;

  beforeEach(() => {
    originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  });

  afterEach(() => {
    if (originalWebSocket === undefined) {
      delete (globalThis as { WebSocket?: unknown }).WebSocket;
    } else {
      (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
    }
  });

  it("returns undefined when globalThis.WebSocket is a function", () => {
    (globalThis as { WebSocket?: unknown }).WebSocket = function FakeWS() {} as unknown;
    expect(assertGlobalWebSocket()).toBeUndefined();
  });

  it("returns ConfigurationError when globalThis.WebSocket is undefined", () => {
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    const err = assertGlobalWebSocket();
    expect(isConfigurationError(err)).toBe(true);
    expect(err?.code).toBe("NODE_WEBSOCKET_UNAVAILABLE");
  });

  it("returns ConfigurationError when globalThis.WebSocket is a non-function value", () => {
    (globalThis as { WebSocket?: unknown }).WebSocket = { not: "a function" };
    const err = assertGlobalWebSocket();
    expect(isConfigurationError(err)).toBe(true);
    expect(err?.code).toBe("NODE_WEBSOCKET_UNAVAILABLE");
  });

  it("error message contains nexus-server pointer + Node ≥21 + URL", () => {
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    const err = assertGlobalWebSocket();
    expect(err?.message).toMatch(/nexus-server/);
    expect(err?.message).toMatch(/Node ≥21/);
    expect(err?.message).toMatch(/https:\/\/nexus\.noverax\.com/);
  });
});
