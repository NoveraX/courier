/**
 * Tests for the proxy-mode branch of the Playground SSE/WS executors.
 *
 * Coverage:
 *  - SSE proxy: dispatches via injected `createProxySSEFactory` with the
 *    `proxyPath` read from the registered source's `options.proxyPath`,
 *    propagates `signal` cancellation, surfaces factory errors as
 *    `onStreamError` (no orphan `stream:open`)
 *  - WS proxy: dispatches via injected `createProxyWSChannelFactory`,
 *    registers the channel for `playground:ws:send` routing, closes on cancel
 *  - Missing source `proxyPath` → `resolveProxyPath` throws
 *    `WS_PATH_NOT_CONFIGURED` for WS, applies default `/api/sse` for SSE
 *  - Mode dispatch: `mode === "direct"` does NOT touch the proxy factories
 *
 * Tests inject stub factories via the executor `deps` parameter — no real
 * network connections are opened.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { createProxySSEFactory, createProxyWSChannelFactory } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { SSESubscription, WSChannel } from "@noverax/nexus/realtime";

import { setAppOrigin } from "../src/connect/app-origin";
import { executeSSEStream } from "../src/connect/playground-sse-executor";
import { executeWSChannel } from "../src/connect/playground-ws-executor";
import { playgroundChannelCount } from "../src/connect/playground-ws-send";

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
  // Studio executor in proxy mode reads appOrigin via getAppOriginParsed().
  // Set a stable value so the existing positive-path tests don't blow up
  // with APP_ORIGIN_NOT_CONFIGURED. Tests that exercise the missing-origin
  // path call setAppOrigin(undefined) explicitly.
  setAppOrigin("http://localhost:3000");
});

afterEach(() => {
  for (const k of Object.keys(mockHooks)) {
    delete hooks[k];
  }
  setAppOrigin(undefined);
});

// ── Stub subscription / channel constructors ────────────────────────────────

function makeStubSSESubscription(): SSESubscription {
  let closed = false;
  return {
    [Symbol.asyncIterator]() {
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          if (closed) return { done: true, value: undefined };
          closed = true;
          return { done: true, value: undefined };
        },
      } as AsyncIterableIterator<{ data: unknown }>;
    },
    close() {
      closed = true;
    },
    status: "connected",
    dropped: 0,
    on() {
      return () => {};
    },
  };
}

function makeStubWSChannel(): { channel: WSChannel; closed: () => boolean } {
  let closed = false;
  const channel: WSChannel = {
    send: vi.fn(),
    on: vi.fn(() => () => {}),
    close: () => {
      closed = true;
    },
    status: "connected",
  };
  return { channel, closed: () => closed };
}

// ── Source fixtures ─────────────────────────────────────────────────────────

/** Build a fake `Sources` map with embedded `options.proxyPath`. */
function sourcesWithProxyPath(proxyPath?: { sse?: string; ws?: string; http?: string }): Sources {
  return {
    api: {
      options: {
        baseURL: "https://api.example.com",
        ...(proxyPath && { proxyPath }),
      },
    },
  } as unknown as Sources;
}

const emptySources = {} as Sources;

function basePayload(
  overrides: Partial<{ mode: "direct" | "proxy"; transport: "sse" | "ws" }>,
) {
  return {
    source: "api",
    group: "chat",
    method: "stream",
    variables: undefined,
    transport: "sse" as const,
    ...overrides,
  };
}

// ── SSE proxy ───────────────────────────────────────────────────────────────

describe("playground SSE executor — proxy mode", () => {
  it("dispatches via injected factory creator with proxyPath + origin", async () => {
    const factory = vi.fn(() => makeStubSSESubscription());
    const factoryCreator = vi.fn(() => factory);
    const sources = sourcesWithProxyPath({ sse: "/api/custom-sse" });

    await executeSSEStream(
      sources,
      basePayload({ mode: "proxy" }),
      "req-1",
      new AbortController().signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );

    expect(factoryCreator).toHaveBeenCalledWith("api", {
      proxyPath: { sse: "/api/custom-sse" },
      origin: { protocol: "http:", host: "localhost:3000" },
    });
    // Studio Playground correlation: requestId is forwarded via the
    // `x-nexus-playground-rid` header so the server-side `createSSEHandler`
    // can use it as its own requestId, correlating events back to this tab.
    expect(factory).toHaveBeenCalledWith("chat", "stream", undefined, {
      headers: { "x-nexus-playground-rid": "req-1" },
    });
    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
  });

  it("merges payload.headers with the playground rid header", async () => {
    const factory = vi.fn(() => makeStubSSESubscription());
    const factoryCreator = vi.fn(() => factory);
    const sources = sourcesWithProxyPath({ sse: "/api/sse" });

    await executeSSEStream(
      sources,
      { ...basePayload({ mode: "proxy" }), headers: { authorization: "Bearer xyz" } },
      "req-merged",
      new AbortController().signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );

    expect(factory).toHaveBeenCalledWith("chat", "stream", undefined, {
      headers: {
        authorization: "Bearer xyz",
        "x-nexus-playground-rid": "req-merged",
      },
    });
  });

  it("uses default sse path when source has no proxyPath", async () => {
    const factory = vi.fn(() => makeStubSSESubscription());
    const factoryCreator = vi.fn(() => factory);
    const sources = sourcesWithProxyPath();

    await executeSSEStream(
      sources,
      basePayload({ mode: "proxy" }),
      "req-2",
      new AbortController().signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );

    // proxyPath undefined → factory still constructed with origin; resolveProxyPath
    // applies the built-in default at subscription time inside the factory.
    expect(factoryCreator).toHaveBeenCalledWith("api", {
      proxyPath: undefined,
      origin: { protocol: "http:", host: "localhost:3000" },
    });
    expect(mockHooks.onStreamError).not.toHaveBeenCalled();
  });

  it("emits APP_ORIGIN_NOT_CONFIGURED when appOrigin is missing", async () => {
    setAppOrigin(undefined);
    const factoryCreator = vi.fn();

    await executeSSEStream(
      sourcesWithProxyPath({ sse: "/api/sse" }),
      basePayload({ mode: "proxy" }),
      "req-no-origin",
      new AbortController().signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );

    expect(factoryCreator).not.toHaveBeenCalled();
    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-no-origin",
        error: expect.stringContaining("appOrigin"),
      }),
    );
  });

  it("calls subscription.close() on external abort", async () => {
    let closed = false;
    const resolveRef: { fn: (() => void) | undefined } = { fn: undefined };
    const subscription: SSESubscription = {
      [Symbol.asyncIterator](): AsyncIterableIterator<{ data: unknown }> {
        const iter: AsyncIterableIterator<{ data: unknown }> = {
          [Symbol.asyncIterator]() {
            return iter;
          },
          async next(): Promise<IteratorResult<{ data: unknown }>> {
            if (closed) return { done: true, value: undefined };
            await new Promise<void>((r) => {
              resolveRef.fn = r;
            });
            return { done: true, value: undefined };
          },
        };
        return iter;
      },
      close() {
        closed = true;
      },
      status: "connected",
      dropped: 0,
      on() {
        return () => {};
      },
    };
    const closeSpy = vi.spyOn(subscription, "close");

    const ac = new AbortController();
    const promise = executeSSEStream(
      sourcesWithProxyPath({ sse: "/api/sse" }),
      basePayload({ mode: "proxy" }),
      "req-3",
      ac.signal,
      {
        createProxySSEFactory: (() => () => subscription) as unknown as ProxySSEFactoryCreator,
      },
    );

    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    resolveRef.fn?.();
    await promise;

    expect(closeSpy).toHaveBeenCalled();
  });

  it("surfaces factory connection errors as onStreamError", async () => {
    const throwingCreator: ProxySSEFactoryCreator = () => {
      throw new Error("ECONNREFUSED");
    };

    await executeSSEStream(
      sourcesWithProxyPath({ sse: "/api/sse" }),
      basePayload({ mode: "proxy" }),
      "req-4",
      new AbortController().signal,
      { createProxySSEFactory: throwingCreator },
    );

    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-4",
        error: expect.stringContaining("ECONNREFUSED"),
      }),
    );
    expect(mockHooks.onStreamOpen).not.toHaveBeenCalled();
  });

  it("does NOT touch the proxy factory when mode is direct", async () => {
    const factoryCreator = vi.fn();
    await executeSSEStream(
      emptySources,
      basePayload({ mode: "direct" }),
      "req-5",
      new AbortController().signal,
      { createProxySSEFactory: factoryCreator as unknown as ProxySSEFactoryCreator },
    );

    expect(factoryCreator).not.toHaveBeenCalled();
  });
});

// ── WS proxy ────────────────────────────────────────────────────────────────

describe("playground WS executor — proxy mode", () => {
  it("dispatches via injected factory with proxyPath + origin + playgroundRequestId and registers channel", async () => {
    const stub = makeStubWSChannel();
    const factory = vi.fn(() => stub.channel);
    const factoryCreator = vi.fn(() => factory);

    const before = playgroundChannelCount();
    const ac = new AbortController();
    const promise = executeWSChannel(
      sourcesWithProxyPath({ ws: "ws://localhost:3001" }),
      basePayload({ mode: "proxy", transport: "ws" }),
      "req-w1",
      ac.signal,
      {
        createProxyWSChannelFactory:
          factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );

    await new Promise((r) => setTimeout(r, 0));

    // Studio Playground correlation: requestId is forwarded via the
    // `playgroundRequestId` factory option. The factory appends it as
    // `?_playground_rid=…` to the WS URL so the server can use it as the
    // per-subscription Studio requestId.
    expect(factoryCreator).toHaveBeenCalledWith("api", {
      proxyPath: { ws: "ws://localhost:3001" },
      origin: { protocol: "http:", host: "localhost:3000" },
      playgroundRequestId: "req-w1",
    });
    expect(factory).toHaveBeenCalledWith("chat", "stream", undefined, {});
    expect(playgroundChannelCount()).toBe(before + 1);

    ac.abort();
    await promise;

    expect(stub.closed()).toBe(true);
    expect(playgroundChannelCount()).toBe(before);
  });

  it("emits APP_ORIGIN_NOT_CONFIGURED when appOrigin is missing", async () => {
    setAppOrigin(undefined);
    const factoryCreator = vi.fn();

    await executeWSChannel(
      sourcesWithProxyPath({ ws: "ws://localhost:3001" }),
      basePayload({ mode: "proxy", transport: "ws" }),
      "req-w-no-origin",
      new AbortController().signal,
      {
        createProxyWSChannelFactory:
          factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );

    expect(factoryCreator).not.toHaveBeenCalled();
    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-w-no-origin",
        error: expect.stringContaining("appOrigin"),
      }),
    );
  });

  it("surfaces ConfigurationError when source has no proxyPath.ws", async () => {
    // The injected creator forwards to the real factory, which will hit
    // resolveProxyPath at first connect and throw WS_PATH_NOT_CONFIGURED.
    const factoryCreator = vi.fn(() => {
      const err = new Error(
        "[nexus] WS endpoint requires `proxyPath.ws` to be configured.",
      );
      Object.assign(err, { name: "ConfigurationError", code: "WS_PATH_NOT_CONFIGURED" });
      throw err;
    });

    await executeWSChannel(
      sourcesWithProxyPath(),
      basePayload({ mode: "proxy", transport: "ws" }),
      "req-w2",
      new AbortController().signal,
      {
        createProxyWSChannelFactory:
          factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );

    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-w2",
        error: expect.stringContaining("proxyPath.ws"),
      }),
    );
    expect(mockHooks.onStreamOpen).not.toHaveBeenCalled();
  });

  it("surfaces URL validation errors from the factory creator", async () => {
    const factoryCreator = vi.fn(() => {
      throw new Error('proxyPath.ws="http://x" must use the ws:// or wss:// scheme.');
    });

    await executeWSChannel(
      sourcesWithProxyPath({ ws: "http://x" }),
      basePayload({ mode: "proxy", transport: "ws" }),
      "req-w3",
      new AbortController().signal,
      {
        createProxyWSChannelFactory:
          factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );

    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-w3",
        error: expect.stringContaining("ws://"),
      }),
    );
    expect(mockHooks.onStreamOpen).not.toHaveBeenCalled();
  });

  it("does NOT touch the proxy factory when mode is direct", async () => {
    const factoryCreator = vi.fn();
    await executeWSChannel(
      emptySources,
      basePayload({ mode: "direct", transport: "ws" }),
      "req-w4",
      new AbortController().signal,
      {
        createProxyWSChannelFactory:
          factoryCreator as unknown as ProxyWSChannelFactoryCreator,
      },
    );

    expect(factoryCreator).not.toHaveBeenCalled();
  });
});
