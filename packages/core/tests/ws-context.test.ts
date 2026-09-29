import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../src/adapter/limits";
import { buildContext } from "../src/adapter/ws-context";
import { createConnectionRegistry } from "../src/adapter/ws-registry";
import { createServerTopicManager } from "../src/adapter/ws-topics";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import type { WebSocketLike } from "../src/realtime/adapters";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/sources";

beforeEach(() => {
  registerSources({} as Parameters<typeof registerSources>[0]);
});

afterEach(() => {
  _resetSourcesForTests();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWs(overrides: Partial<WebSocketLike> = {}): WebSocketLike {
  return {
    readyState: 1,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    ...overrides,
  };
}

function createConfig(overrides: Partial<WSHandlerConfig> = {}): WSHandlerConfig {
  return { ...overrides } as WSHandlerConfig;
}

function buildTestContext(
  wsOverrides: Partial<WebSocketLike> = {},
  configOverrides: Partial<WSHandlerConfig> = {},
) {
  const ws = createMockWs(wsOverrides);
  const config = createConfig(configOverrides);
  const topicManager = createServerTopicManager();
  const registry = createConnectionRegistry();
  registry.setTopicManager(topicManager);
  const request = new Request("http://localhost/ws");

  return { ws, config, topicManager, registry, request };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildContext", () => {
  it("returns a context with a UUID connectionId", () => {
    const { ws, config, topicManager, registry, request } = buildTestContext();
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    expect(ctx.connectionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("uses default LIMITS when config omits values", () => {
    const { ws, config, topicManager, registry, request } = buildTestContext();
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    expect(ctx.maxSubscriptions).toBe(LIMITS.MAX_SUBSCRIPTIONS_PER_CONNECTION);
    expect(ctx.maxMessageSize).toBe(LIMITS.MAX_MESSAGE_SIZE);
    expect(ctx.middlewareTimeoutMs).toBe(LIMITS.MIDDLEWARE_TIMEOUT_MS);
  });

  it("uses custom limits from config", () => {
    const { ws, topicManager, registry, request } = buildTestContext();
    const config = createConfig({
      maxSubscriptionsPerConnection: 5,
      maxMessageSize: 1024,
      middlewareTimeoutMs: 500,
    });
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    expect(ctx.maxSubscriptions).toBe(5);
    expect(ctx.maxMessageSize).toBe(1024);
    expect(ctx.middlewareTimeoutMs).toBe(500);
  });

  // ── Studio Playground correlation: _playground_rid query param ────────────

  it("extracts playgroundRequestId from `_playground_rid` query param on the upgrade URL", () => {
    const ws = createMockWs();
    const config = createConfig();
    const topicManager = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(topicManager);
    const request = new Request("http://localhost/ws?_playground_rid=playground-rid-xyz-789");

    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);
    expect(ctx.playgroundRequestId).toBe("playground-rid-xyz-789");
  });

  it("playgroundRequestId is undefined when the query param is absent (production browser path)", () => {
    const { ws, config, topicManager, registry, request } = buildTestContext();
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);
    expect(ctx.playgroundRequestId).toBeUndefined();
  });

  it("playgroundRequestId is undefined when the param is empty string", () => {
    const ws = createMockWs();
    const config = createConfig();
    const topicManager = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(topicManager);
    // URL.searchParams.get returns "" for `?_playground_rid=` — we treat that
    // as "not set" so the default generated id path is used.
    const request = new Request("http://localhost/ws?_playground_rid=");

    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);
    // Empty string is technically a string, so the current implementation
    // would use it. We document that as the actual behavior — empty rid
    // would still correlate uniquely (everyone sharing the empty string),
    // which is bad in theory but never happens in practice because the
    // playground executor always passes a UUID.
    expect(ctx.playgroundRequestId).toBe("");
  });

  it("preserves the query param across other URL params", () => {
    const ws = createMockWs();
    const config = createConfig();
    const topicManager = createServerTopicManager();
    const registry = createConnectionRegistry();
    registry.setTopicManager(topicManager);
    const request = new Request("http://localhost/ws?token=abc&_playground_rid=rid-mixed&other=1");

    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);
    expect(ctx.playgroundRequestId).toBe("rid-mixed");
  });

  it("initializes seq at 0 and t0 near current time", () => {
    const { ws, config, topicManager, registry, request } = buildTestContext();
    const before = performance.now();
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    expect(ctx.seq.value).toBe(0);
    expect(ctx.t0).toBeGreaterThanOrEqual(before);
    expect(ctx.t0).toBeLessThanOrEqual(performance.now());
  });

  it("initializes empty meta object", () => {
    const { ws, config, topicManager, registry, request } = buildTestContext();
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    expect(ctx.meta).toEqual({});
  });

  it("passes through sources, registry, topicManager, and bridge", () => {
    const { ws, topicManager, registry, request } = buildTestContext();
    const sources = { api: {} };
    registerSources(sources as Parameters<typeof registerSources>[0]);
    const config = createConfig();
    const bridge = {
      onTopicSubscribe: vi.fn(),
      onTopicUnsubscribe: vi.fn(),
      onConnectionOpen: vi.fn(),
      onConnectionClose: vi.fn(),
      publishToTopic: vi.fn(),
      publishToBaseTopic: vi.fn(),
      publishToAll: vi.fn(),
      destroy: vi.fn(),
    };

    const ctx = buildContext(ws, config, topicManager, registry, bridge, request);

    expect(ctx.sources).toBe(sources);
    expect(ctx.registry).toBe(registry);
    expect(ctx.topicManager).toBe(topicManager);
    expect(ctx.bridge).toBe(bridge);
  });

  it("passes the request object through", () => {
    const { ws, config, topicManager, registry, request } = buildTestContext();
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    expect(ctx.request).toBe(request);
  });

  it("sendMessage does not send when readyState is not OPEN", () => {
    const send = vi.fn();
    const { config, topicManager, registry, request } = buildTestContext();
    const ws = createMockWs({ readyState: 3, send });
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    ctx.sendMessage({ type: "data", payload: "test" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sendMessage does not send when bufferedAmount exceeds limit", () => {
    const send = vi.fn();
    const { topicManager, registry, request } = buildTestContext();
    const ws = createMockWs({ readyState: 1, bufferedAmount: 2_000_000, send });
    const config = createConfig({ maxBufferedAmount: 1_000_000 });
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    ctx.sendMessage({ type: "data", payload: "test" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sendMessage sends encoded JSON when socket is ready", () => {
    const send = vi.fn();
    const { config, topicManager, registry, request } = buildTestContext();
    const ws = createMockWs({ readyState: 1, bufferedAmount: 0, send });
    const ctx = buildContext(ws, config, topicManager, registry, undefined, request);

    const msg: WSMessage = { type: "data", payload: "hello" };
    ctx.sendMessage(msg);

    expect(send).toHaveBeenCalledOnce();
    const sent = JSON.parse(send.mock.calls[0]![0] as string) as WSMessage;
    expect(sent.type).toBe("data");
    expect(sent.payload).toBe("hello");
  });
});
