import { afterEach, describe, expect, it, vi } from "vitest";
import { devtoolsHooks, executeRequest } from "@noverax/nexus";
import { defineApi, defineGroup, endpoint } from "@noverax/nexus/define";
import type { AnyDevToolsEvent } from "../src/events";
import { connectDevTools, type DevToolsConnection } from "../src/connect";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Create a test API
const api = defineApi({
  baseURL: "https://api.test.com",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        getAll: endpoint<{ id: number }[]>()((http) => http.get()),
        getById: endpoint<{ id: number }, { id: number }>()((http, vars) => http.get(":id", vars)),
      },
    }),
  },
});

const sources = { api };

describe("DevTools Instrumentation", () => {
  let connection: DevToolsConnection | null = null;

  afterEach(() => {
    connection?.disconnect();
    connection = null;
    mockFetch.mockReset();
  });

  it("emits request:start and request:end events", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await executeRequest(sources, {
      source: "api",
      group: "users",
      method: "getAll",
    });

    const startEvent = events.find((e) => e.type === "request:start");
    const endEvent = events.find((e) => e.type === "request:end");

    expect(startEvent).toBeDefined();
    expect(startEvent).toMatchObject({
      type: "request:start",
      source: "api",
      group: "users",
      method: "getAll",
      mode: "direct",
    });

    expect(endEvent).toBeDefined();
    expect(endEvent).toMatchObject({
      type: "request:end",
      status: 200,
    });
  });

  it("emits request:error on failed requests", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      await executeRequest(sources, {
        source: "api",
        group: "users",
        method: "getAll",
      });
    } catch {
      // expected
    }

    const errorEvent = events.find((e) => e.type === "request:error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toMatchObject({
      type: "request:error",
      error: { type: "http", status: 404 },
    });
  });

  it("emits http:fetch:start and http:fetch:end events", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await executeRequest(sources, {
      source: "api",
      group: "users",
      method: "getAll",
    });

    const fetchStart = events.find((e) => e.type === "http:fetch:start");
    const fetchEnd = events.find((e) => e.type === "http:fetch:end");

    expect(fetchStart).toBeDefined();
    expect(fetchEnd).toBeDefined();
    expect(fetchEnd).toMatchObject({
      type: "http:fetch:end",
      status: 200,
    });
  });

  it("assigns unique session ID to all events", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await executeRequest(sources, {
      source: "api",
      group: "users",
      method: "getAll",
    });

    expect(events.length).toBeGreaterThan(0);
    const sessionId = connection.sessionId;
    for (const event of events) {
      expect(event.sessionId).toBe(sessionId);
    }
  });

  it("stops emitting after disconnect", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    const makeResponse = () =>
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    mockFetch.mockResolvedValueOnce(makeResponse());

    await executeRequest(sources, {
      source: "api",
      group: "users",
      method: "getAll",
    });

    const countBefore = events.length;

    connection.disconnect();
    connection = null;

    mockFetch.mockResolvedValueOnce(makeResponse());

    await executeRequest(sources, {
      source: "api",
      group: "users",
      method: "getAll",
    });

    // No new events after disconnect
    expect(events.length).toBe(countBefore);
  });

  it("filters events by source", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools({ filter: { sources: ["other"] } });
    connection.bus.on((e) => events.push(e));

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await executeRequest(sources, {
      source: "api",
      group: "users",
      method: "getAll",
    });

    // request:start should be filtered (source "api" not in ["other"])
    const startEvent = events.find((e) => e.type === "request:start");
    expect(startEvent).toBeUndefined();
  });

  it("emits proxy:receive and proxy:respond via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    // Simulate proxy hooks firing (these are called by adapter.ts)
    devtoolsHooks.onProxyReceive?.({
      proxyMethod: "POST",
      source: "api",
      group: "users",
      method: "getAll",
      timestamp: performance.now(),
    });

    devtoolsHooks.onProxyRespond?.({
      proxyMethod: "POST",
      source: "api",
      group: "users",
      method: "getAll",
      status: 200,
      timestamp: performance.now(),
    });

    const receiveEvent = events.find((e) => e.type === "proxy:receive");
    const respondEvent = events.find((e) => e.type === "proxy:respond");

    expect(receiveEvent).toBeDefined();
    expect(receiveEvent).toMatchObject({
      type: "proxy:receive",
      proxyMethod: "POST",
      source: "api",
      group: "users",
      method: "getAll",
    });

    expect(respondEvent).toBeDefined();
    expect(respondEvent).toMatchObject({
      type: "proxy:respond",
      status: 200,
    });
  });

  it("emits middleware events via hooks", async () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    // Simulate middleware hooks firing (these are called by composeMiddleware)
    devtoolsHooks.onMiddlewareEnter?.({
      requestId: "api:users:getAll",
      name: "auth",
      index: 0,
      totalCount: 2,
      phase: "before",
      timestamp: performance.now(),
    });

    devtoolsHooks.onMiddlewareExit?.({
      requestId: "api:users:getAll",
      name: "auth",
      index: 0,
      duration: 5,
      phase: "before",
      beforeDuration: 5,
      afterDuration: 0,
      headersAdded: ["Authorization"],
      timestamp: performance.now(),
    });

    devtoolsHooks.onMiddlewareError?.({
      requestId: "api:users:getAll",
      name: "logger",
      index: 1,
      phase: "wrap",
      error: "Something failed",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "middleware:enter")).toMatchObject({
      type: "middleware:enter",
      name: "auth",
      index: 0,
      totalCount: 2,
    });

    expect(events.find((e) => e.type === "middleware:exit")).toMatchObject({
      type: "middleware:exit",
      name: "auth",
      duration: 5,
    });

    expect(events.find((e) => e.type === "middleware:error")).toMatchObject({
      type: "middleware:error",
      name: "logger",
      error: "Something failed",
    });
  });

  it("filters proxy events by source", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools({ filter: { sources: ["other"] } });
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onProxyReceive?.({
      proxyMethod: "GET",
      source: "api",
      group: "users",
      method: "getAll",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "proxy:receive")).toBeUndefined();
  });

  it("emits cache:hit, cache:miss, cache:store via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onCacheMiss?.({
      requestId: "api:users:getAll",
      key: "api:users:getAll:{}",
      timestamp: performance.now(),
    });

    devtoolsHooks.onCacheStore?.({
      requestId: "api:users:getAll",
      key: "api:users:getAll:{}",
      ttl: 60000,
      timestamp: performance.now(),
    });

    devtoolsHooks.onCacheHit?.({
      requestId: "api:users:getAll",
      key: "api:users:getAll:{}",
      age: 5000,
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "cache:miss")).toMatchObject({
      type: "cache:miss",
      key: "api:users:getAll:{}",
    });

    expect(events.find((e) => e.type === "cache:store")).toMatchObject({
      type: "cache:store",
      key: "api:users:getAll:{}",
      ttl: 60000,
    });

    expect(events.find((e) => e.type === "cache:hit")).toMatchObject({
      type: "cache:hit",
      key: "api:users:getAll:{}",
      age: 5000,
    });
  });

  it("emits dedup:abort via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onDedupAbort?.({
      requestId: "GET:/api/users",
      key: "GET:/api/users",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "dedup:abort")).toMatchObject({
      type: "dedup:abort",
      key: "GET:/api/users",
    });
  });

  it("emits request:abort via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onRequestAbort?.({
      id: "req_123",
      reason: "deduplication",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "request:abort")).toMatchObject({
      type: "request:abort",
      requestId: "req_123",
      reason: "deduplication",
    });
  });

  it("emits http:fetch:error via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onHttpFetchError?.({
      requestId: "req_456",
      message: "Network request failed",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "http:fetch:error")).toMatchObject({
      type: "http:fetch:error",
      requestId: "req_456",
      message: "Network request failed",
    });
  });

  it("emits proxy:parse via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onProxyParse?.({
      source: "api",
      group: "users",
      method: "getById",
      variables: { id: 1 },
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "proxy:parse")).toMatchObject({
      type: "proxy:parse",
      source: "api",
      group: "users",
      method: "getById",
      variables: { id: 1 },
    });
  });

  it("emits proxy:origin-reject via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onProxyOriginReject?.({
      origin: "https://evil.com",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "proxy:origin-reject")).toMatchObject({
      type: "proxy:origin-reject",
      origin: "https://evil.com",
    });
  });

  it("emits dedup:reuse via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onDedupReuse?.({
      requestId: "GET:/api/users",
      key: "GET:/api/users",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "dedup:reuse")).toMatchObject({
      type: "dedup:reuse",
      key: "GET:/api/users",
    });
  });

  it("emits upload:progress and upload:complete via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onUploadProgress?.({
      requestId: "upload_1",
      loaded: 500,
      total: 1000,
      percentage: 0.5,
      timestamp: performance.now(),
    });

    devtoolsHooks.onUploadComplete?.({
      requestId: "upload_1",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "upload:progress")).toMatchObject({
      type: "upload:progress",
      requestId: "upload_1",
      loaded: 500,
      total: 1000,
      percentage: 0.5,
    });

    expect(events.find((e) => e.type === "upload:complete")).toMatchObject({
      type: "upload:complete",
      requestId: "upload_1",
    });
  });

  it("emits cache:invalidate via hooks", () => {
    const events: AnyDevToolsEvent[] = [];
    connection = connectDevTools();
    connection.bus.on((e) => events.push(e));

    devtoolsHooks.onCacheInvalidate?.({
      key: "api:users:getAll:{}",
      reason: "manual",
      timestamp: performance.now(),
    });

    expect(events.find((e) => e.type === "cache:invalidate")).toMatchObject({
      type: "cache:invalidate",
      key: "api:users:getAll:{}",
      reason: "manual",
    });
  });

  it("cleans up all hooks on disconnect", () => {
    connection = connectDevTools();
    expect(devtoolsHooks.onRequestStart).toBeDefined();
    expect(devtoolsHooks.onProxyReceive).toBeDefined();
    expect(devtoolsHooks.onMiddlewareEnter).toBeDefined();
    expect(devtoolsHooks.onCacheHit).toBeDefined();
    expect(devtoolsHooks.onDedupAbort).toBeDefined();

    connection.disconnect();
    connection = null;

    expect(devtoolsHooks.onRequestStart).toBeUndefined();
    expect(devtoolsHooks.onRequestEnd).toBeUndefined();
    expect(devtoolsHooks.onRequestError).toBeUndefined();
    expect(devtoolsHooks.onRequestAbort).toBeUndefined();
    expect(devtoolsHooks.onProxyReceive).toBeUndefined();
    expect(devtoolsHooks.onProxyRespond).toBeUndefined();
    expect(devtoolsHooks.onProxyParse).toBeUndefined();
    expect(devtoolsHooks.onProxyOriginReject).toBeUndefined();
    expect(devtoolsHooks.onMiddlewareEnter).toBeUndefined();
    expect(devtoolsHooks.onMiddlewareExit).toBeUndefined();
    expect(devtoolsHooks.onMiddlewareError).toBeUndefined();
    expect(devtoolsHooks.onHttpFetchStart).toBeUndefined();
    expect(devtoolsHooks.onHttpFetchEnd).toBeUndefined();
    expect(devtoolsHooks.onHttpFetchError).toBeUndefined();
    expect(devtoolsHooks.onCacheHit).toBeUndefined();
    expect(devtoolsHooks.onCacheMiss).toBeUndefined();
    expect(devtoolsHooks.onCacheStore).toBeUndefined();
    expect(devtoolsHooks.onCacheInvalidate).toBeUndefined();
    expect(devtoolsHooks.onDedupAbort).toBeUndefined();
    expect(devtoolsHooks.onDedupReuse).toBeUndefined();
    expect(devtoolsHooks.onUploadProgress).toBeUndefined();
    expect(devtoolsHooks.onUploadComplete).toBeUndefined();
  });

  it("prevents double connection", () => {
    connection = connectDevTools();
    const second = connectDevTools();

    expect(second).toBe(connection);
  });
});
