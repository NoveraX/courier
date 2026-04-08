import { describe, expect, it, vi } from "vitest";
import { createMockStore } from "../src/store/mock-store";
import { createNetworkState } from "../src/network/state";
import { createEventEmitter } from "../src/studio/event-emitter";
import { createCommandHandler } from "../src/studio/command-handler";
import { createFileWatcher } from "../src/studio/file-watcher";
import type { BridgeContext, MockCommand } from "../src/studio/types";
import type { MockServer } from "../src/server/create-mock-server";

// ── Mock socket ──────────────────────────────────────────────────────────────

function createMockSocket() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: Array<{ event: string; data: unknown }> = [];

  return {
    emit(event: string, data: unknown) {
      emitted.push({ event, data });
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
    },
    /** Simulate incoming event */
    trigger(event: string, ...args: unknown[]) {
      for (const h of handlers.get(event) ?? []) h(...args);
    },
    get emitted() {
      return emitted;
    },
    get handlers() {
      return handlers;
    },
    clear() {
      emitted.length = 0;
    },
  };
}

// ── Mock server ──────────────────────────────────────────────────────────────

function createTestServer() {
  const store = createMockStore();
  const networkState = createNetworkState();
  return {
    store,
    history: [] as unknown[],
    scenarios: {},
    scenarioState: "Started",
    requestHooks: {} as Record<string, unknown>,
    networkState,
  } as unknown as MockServer;
}

// ── Bridge context factory ───────────────────────────────────────────────────

function createTestContext(overrides?: Partial<BridgeContext>): BridgeContext {
  const server = createTestServer();
  return {
    server,
    serverId: "test-server",
    sessionId: "test-session",
    name: "Test Server",
    port: 7001,
    url: "http://localhost:7001",
    startedAt: Date.now(),
    requestCounter: 0,
    scenarioRequestCount: 0,
    routeCount: 0,
    routes: [],
    analyzedRoutes: [],
    activeScenario: "happy-path",
    availableScenarios: ["happy-path"],
    scenarioMap: {},
    ...overrides,
  };
}

// ── EventEmitter tests ───────────────────────────────────────────────────────

describe("createEventEmitter", () => {
  it("emits events with correct envelope", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitDisconnect();

    expect(socket.emitted).toHaveLength(1);
    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(socket.emitted[0]!.event).toBe("event");
    expect(payload.type).toBe("mock:server:disconnect");
    expect(payload.sessionId).toBe("test-session");
    expect(payload.serverId).toBe("test-server");
    expect(typeof payload.id).toBe("string");
    expect(typeof payload.timestamp).toBe("number");
  });

  it("emitConnect sends full server snapshot", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    // Seed some data
    ctx.server.store.collection("users").seed([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitConnect();

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:server:connect");
    expect(payload.name).toBe("Test Server");
    expect(payload.port).toBe(7001);
    expect(payload.collectionCount).toBe(1);
    expect(payload.recordCount).toBe(2);
    expect(payload.activeScenario).toBe("happy-path");
    expect(payload.collections).toBeDefined();
    const cols = payload.collections as Array<{ name: string; count: number }>;
    expect(cols[0]!.name).toBe("users");
    expect(cols[0]!.count).toBe(2);
  });

  it("emitRequestStart increments counters", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    expect(ctx.requestCounter).toBe(0);
    emitter.emitRequestStart("req-1", "GET", "/users", "users", "getAll");
    expect(ctx.requestCounter).toBe(1);
    expect(ctx.scenarioRequestCount).toBe(1);

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:request:start");
    expect(payload.requestId).toBe("req-1");
    expect(payload.httpMethod).toBe("GET");
  });

  it("emitRequestEnd sends duration and status", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitRequestEnd("req-1", 200, { ok: true }, 42, 10, "Started");

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:request:end");
    expect(payload.status).toBe(200);
    expect(payload.duration).toBe(42);
    expect(payload.latencyInjected).toBe(10);
  });

  it("emitRequestError increments scenarioRequestCount", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitRequestError("req-1", 500, "Internal error", 15);
    expect(ctx.scenarioRequestCount).toBe(1);

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:request:error");
    expect(payload.status).toBe(500);
  });

  it("emitStoreSnapshot sends all collections", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    ctx.server.store.collection("products").seed([{ id: 1, name: "Widget" }]);
    ctx.server.store.collection("orders").seed([{ id: 1, total: 100 }]);
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitStoreSnapshot();

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:store:snapshot");
    const cols = payload.collections as Array<{ name: string; count: number }>;
    expect(cols).toHaveLength(2);
  });

  it("emitStoreChange sends single mutation", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitStoreChange("users", "create", { id: 1 }, 1);

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:store:change");
    expect(payload.collection).toBe("users");
    expect(payload.operation).toBe("create");
  });

  it("emitScenarioActive resets scenarioRequestCount", () => {
    const socket = createMockSocket();
    const ctx = createTestContext({ scenarioRequestCount: 10 });
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitScenarioActive("empty");

    expect(ctx.scenarioRequestCount).toBe(0);
    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:scenario:active");
    expect(payload.scenario).toBe("empty");
    expect(payload.scenarioRequestCount).toBe(0);
  });

  it("emitNetworkConfig sends config payload", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitNetworkConfig({ latency: 100, errorRate: 0.5 });

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:network:config");
    expect(payload.config).toEqual({ latency: 100, errorRate: 0.5 });
  });

  it("emitHotReload sends changed files", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitHotReload(["scenarios.ts", "overrides.ts"], 3);

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:hotreload");
    expect(payload.files).toEqual(["scenarios.ts", "overrides.ts"]);
    expect(payload.routesChanged).toBe(3);
  });

  it("emitExperimentEvent forwards payload", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    emitter.emitExperimentEvent({ eventType: "started", mode: "3g" });

    const payload = socket.emitted[0]!.data as Record<string, unknown>;
    expect(payload.type).toBe("mock:experiment:event");
    expect(payload.eventType).toBe("started");
  });
});

// ── CommandHandler tests ─────────────────────────────────────────────────────

describe("createCommandHandler", () => {
  it("registers handler on mock:command and returns cleanup", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);

    const cleanup = createCommandHandler(socket, ctx, emitter);
    expect(socket.handlers.get("mock:command")?.size).toBe(1);

    cleanup();
    expect(socket.handlers.get("mock:command")?.size).toBe(0);
  });

  it("ignores commands with mismatched serverId", () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);
    createCommandHandler(socket, ctx, emitter);

    const cb = vi.fn();
    socket.trigger("mock:command", { action: "mock:server:reset", serverId: "wrong" }, cb);

    // Callback not called because serverId doesn't match
    expect(cb).not.toHaveBeenCalled();
  });

  describe("store commands", () => {
    it("mock:store:create adds a record", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.store.collection("users");
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      const cmd: MockCommand = {
        action: "mock:store:create",
        serverId: "test-server",
        collection: "users",
        record: { id: 1, name: "Alice" },
      };

      socket.trigger("mock:command", cmd, cb);
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      expect(ctx.server.store.collection("users").count()).toBe(1);
    });

    it("mock:store:update modifies a record", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.store.collection("users").seed([{ id: 1, name: "Alice" }]);
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:store:update",
          serverId: "test-server",
          collection: "users",
          id: 1,
          data: { name: "Bob" },
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      const user = ctx.server.store.collection("users").getById(1) as Record<string, unknown>;
      expect(user.name).toBe("Bob");
    });

    it("mock:store:delete removes a record", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.store.collection("users").seed([{ id: 1, name: "Alice" }]);
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:store:delete",
          serverId: "test-server",
          collection: "users",
          id: 1,
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      expect(ctx.server.store.collection("users").count()).toBe(0);
    });

    it("mock:store:delete with '*' clears collection", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.store.collection("items").seed([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ]);
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:store:delete",
          serverId: "test-server",
          collection: "items",
          id: "*",
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(ctx.server.store.collection("items").count()).toBe(0);
    });

    it("store mutations trigger snapshot emission", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.store.collection("users");
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      socket.clear();
      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:store:create",
          serverId: "test-server",
          collection: "users",
          record: { id: 1, name: "X" },
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      const snapshotEvent = socket.emitted.find(
        (e) => (e.data as Record<string, unknown>).type === "mock:store:snapshot",
      );
      expect(snapshotEvent).toBeDefined();
    });
  });

  describe("server reset", () => {
    it("mock:server:reset clears store and history", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.store.collection("users").seed([{ id: 1 }]);
      (ctx.server.history as unknown[]).push({ mock: true });
      ctx.requestCounter = 10;

      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        { action: "mock:server:reset", serverId: "test-server" },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: true, data: { reset: true } }));
      expect(ctx.requestCounter).toBe(0);
      expect(ctx.server.history).toHaveLength(0);
    });

    it("mock:server:reset calls reseed when provided", async () => {
      const socket = createMockSocket();
      const reseed = vi.fn();
      const ctx = createTestContext({ reseed });
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        { action: "mock:server:reset", serverId: "test-server" },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(reseed).toHaveBeenCalled();
    });
  });

  describe("network commands", () => {
    it("mock:network:set applies latency config", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:network:set",
          serverId: "test-server",
          config: { latency: { min: 100, max: 200 } },
          preset: "custom",
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      const cfg = ctx.server.networkState.getGlobalConfig();
      expect(cfg?.latency).toEqual({ min: 100, max: 200 });
    });

    it("mock:network:set with latency=0 clears latency", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      ctx.server.networkState.mergeConfig({ latency: { min: 100, max: 200 } });
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:network:set",
          serverId: "test-server",
          config: { latency: 0 },
          preset: "none",
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      const cfg = ctx.server.networkState.getGlobalConfig();
      expect(cfg?.latency).toBeUndefined();
    });

    it("mock:chaos:set applies error rate", async () => {
      const socket = createMockSocket();
      const ctx = createTestContext();
      const emitter = createEventEmitter(socket, ctx);
      createCommandHandler(socket, ctx, emitter);

      const cb = vi.fn();
      socket.trigger(
        "mock:command",
        {
          action: "mock:chaos:set",
          serverId: "test-server",
          config: { errorRate: 0.5 },
          preset: "degraded",
        },
        cb,
      );
      await vi.waitFor(() => expect(cb).toHaveBeenCalled());

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      expect(ctx.server.networkState.getGlobalConfig()?.errorRate).toBe(0.5);
      expect(ctx.server.networkState.chaosPreset).toBe("degraded");
    });
  });

  it("calls callback with error for unknown commands", async () => {
    const socket = createMockSocket();
    const ctx = createTestContext();
    const emitter = createEventEmitter(socket, ctx);
    createCommandHandler(socket, ctx, emitter);

    const cb = vi.fn();
    socket.trigger(
      "mock:command",
      { action: "mock:unknown:action", serverId: "test-server" },
      cb,
    );
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });
});

// ── FileWatcher tests ────────────────────────────────────────────────────────

describe("createFileWatcher", () => {
  it("returns handle with stop method and watchCount", () => {
    const watcher = createFileWatcher({
      paths: ["/tmp/nonexistent-path-xyz"],
      onChange: () => {},
    });
    // Non-existent path → 0 watchers
    expect(watcher.watchCount).toBe(0);
    watcher.stop();
  });

  it("silently skips non-existent paths", () => {
    const onChange = vi.fn();
    const watcher = createFileWatcher({
      paths: ["/tmp/definitely-does-not-exist-12345"],
      onChange,
    });
    expect(watcher.watchCount).toBe(0);
    watcher.stop();
  });

  it("watches existing directories", () => {
    const onChange = vi.fn();
    const watcher = createFileWatcher({
      paths: ["/tmp"],
      onChange,
      debounce: 50,
    });
    expect(watcher.watchCount).toBe(1);
    watcher.stop();
    expect(watcher.watchCount).toBe(0);
  });

  it("stop clears all watchers", () => {
    const watcher = createFileWatcher({
      paths: ["/tmp"],
      onChange: () => {},
    });
    expect(watcher.watchCount).toBe(1);
    watcher.stop();
    expect(watcher.watchCount).toBe(0);
  });
});
