import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CourierModule from "@noverax/courier";

vi.mock("@noverax/courier", async (importOriginal) => {
  const actual = await importOriginal<typeof CourierModule>();
  return {
    ...actual,
    createHandler: vi.fn(() => ({
      handle: vi.fn(),
      handleGet: vi.fn(),
      handlePost: vi.fn(),
      handleSSE: vi.fn(),
      sseConnections: { count: 0, isShuttingDown: false, get: vi.fn(), has: vi.fn(), list: vi.fn(() => []), getByMeta: vi.fn(() => []), getByEndpoint: vi.fn(() => []), disconnect: vi.fn(), disconnectAll: vi.fn(), send: vi.fn(() => true), broadcastToEndpoint: vi.fn(() => new Map()), broadcastToMeta: vi.fn(() => new Map()), broadcastAll: vi.fn(() => new Map()) },
      shutdownSSE: vi.fn(),
    })),
    createWSHandler: vi.fn(() => ({
      handleSocket: vi.fn(),
      connections: { count: 0, get: vi.fn(), has: vi.fn(), list: vi.fn(() => []), getByMeta: vi.fn(() => []), send: vi.fn(), broadcast: vi.fn(), broadcastToTopic: vi.fn(), broadcastToBaseTopic: vi.fn(), sendToConnection: vi.fn(), disconnect: vi.fn(), disconnectByMeta: vi.fn() },
      destroy: vi.fn(),
    })),
  };
});

import { createHandler, createWSHandler, registerSources } from "@noverax/courier";
import { courierHandler, courierSSEHandler, courierWSHandler } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);
const mockCreateWSHandler = vi.mocked(createWSHandler);

beforeEach(() => {
  registerSources({ api: {} } as Parameters<typeof registerSources>[0]);
});

afterEach(() => {
  vi.clearAllMocks();
});

function createMockHandlerResult(overrides: Record<string, unknown> = {}) {
  return {
    handle: vi.fn(),
    handleGet: vi.fn(),
    handlePost: vi.fn(),
    handleSSE: vi.fn(),
    sseConnections: { count: 0, isShuttingDown: false, get: vi.fn(), has: vi.fn(), list: vi.fn(() => []), getByMeta: vi.fn(() => []), getByEndpoint: vi.fn(() => []), disconnect: vi.fn(), disconnectAll: vi.fn(), send: vi.fn(() => true), broadcastToEndpoint: vi.fn(() => new Map()), broadcastToMeta: vi.fn(() => new Map()), broadcastAll: vi.fn(() => new Map()) },
    shutdownSSE: vi.fn(),
    ...overrides,
  };
}

function createMockWSResult(handleSocket = vi.fn()) {
  return {
    handleSocket,
    connections: { count: 0, get: vi.fn(), has: vi.fn(), list: vi.fn(() => []), getByMeta: vi.fn(() => []), send: vi.fn(), broadcast: vi.fn(), broadcastToTopic: vi.fn(), broadcastToBaseTopic: vi.fn(), sendToConnection: vi.fn(), disconnect: vi.fn(), disconnectByMeta: vi.fn() },
    destroy: vi.fn(),
  };
}

function createHonoContext(request: Request) {
  return {
    req: { raw: request },
  } as any;
}

describe("courierHandler", () => {
  it("returns a function", () => {
    const handler = courierHandler();
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with no sources arg (zero-arg)", () => {
    courierHandler();
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const config = { allowedOrigins: ["https://app.example.com"] };
    courierHandler(config);
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("passes c.req.raw to handle", async () => {
    const mockHandle = vi.fn().mockResolvedValue(new Response("{}"));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = courierHandler();
    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const ctx = createHonoContext(request);

    await handler(ctx);

    expect(mockHandle).toHaveBeenCalledWith(request);
  });

  it("returns the Response from handle", async () => {
    const expectedResponse = new Response(JSON.stringify({ data: "test" }));
    const mockHandle = vi.fn().mockResolvedValue(expectedResponse);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = courierHandler();
    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const ctx = createHonoContext(request);

    const result = await handler(ctx);
    expect(result).toBe(expectedResponse);
  });

  it("handles POST requests via handle", async () => {
    const mockHandle = vi.fn().mockResolvedValue(new Response("{}"));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = courierHandler();
    const request = new Request("http://localhost/api/request?_s=api&_m=list", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({}),
    });
    const ctx = createHonoContext(request);

    await handler(ctx);

    expect(mockHandle).toHaveBeenCalledWith(request);
  });
});

describe("courierSSEHandler", () => {
  it("returns a function", () => {
    const handler = courierSSEHandler();
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with no sources arg (zero-arg)", () => {
    courierSSEHandler();
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const config = { sseHeaders: { "Access-Control-Allow-Origin": "*" }, sseMaxLifetimeMs: 60_000 };
    courierSSEHandler(config);
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("passes c.req.raw to handleSSE", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
    const request = new Request("http://localhost/api/sse?_s=api&_m=feed");
    const ctx = createHonoContext(request);

    await handler(ctx);

    expect(mockHandleSSE).toHaveBeenCalledWith(request);
  });

  it("preserves all SSE response headers through the adapter", async () => {
    const sseResponse = new Response("data: hello\n\n", {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        "x-accel-buffering": "no",
      },
    });
    const mockHandleSSE = vi.fn().mockResolvedValue(sseResponse);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
    const request = new Request("http://localhost/api/sse?_s=api&_m=feed");
    const ctx = createHonoContext(request);

    const result = (await handler(ctx)) as Response;

    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(result.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(result.headers.get("connection")).toBe("keep-alive");
    expect(result.headers.get("x-accel-buffering")).toBe("no");
  });

  it("returns the SSE Response", async () => {
    const sseResponse = new Response("data: test\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    const mockHandleSSE = vi.fn().mockResolvedValue(sseResponse);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
    const request = new Request("http://localhost/api/sse?_s=api&_m=feed");
    const ctx = createHonoContext(request);

    const result = await handler(ctx);
    expect(result).toBe(sseResponse);
  });
});

describe("courierWSHandler", () => {
  it("returns a factory function", () => {
    const factory = courierWSHandler();
    expect(typeof factory).toBe("function");
  });

  it("calls createWSHandler with just the options (no sources)", () => {
    const options = { heartbeatIntervalMs: 5000 };
    courierWSHandler(options);
    expect(mockCreateWSHandler).toHaveBeenCalledWith(options);
  });

  it("factory returns WSEvents object", () => {
    const factory = courierWSHandler();
    const ctx = createHonoContext(new Request("http://localhost/ws"));
    const events = factory(ctx);

    expect(events.onOpen).toBeDefined();
    expect(events.onMessage).toBeDefined();
    expect(events.onClose).toBeDefined();
    expect(events.onError).toBeDefined();
  });

  it("onOpen calls handleSocket with adapter and request", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const factory = courierWSHandler();
    const request = new Request("http://localhost/ws");
    const ctx = createHonoContext(request);
    const events = factory(ctx);

    const fakeWS = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    events.onOpen!({}, fakeWS);

    expect(mockHandleSocket).toHaveBeenCalledTimes(1);
    const [adapter, req] = mockHandleSocket.mock.calls[0]!;
    expect(req).toBe(request);
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.addEventListener).toBe("function");
  });

  it("onMessage forwards data to adapter message listeners", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const factory = courierWSHandler();
    const ctx = createHonoContext(new Request("http://localhost/ws"));
    const events = factory(ctx);

    const fakeWS = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    events.onOpen!({}, fakeWS);

    // Get the adapter from handleSocket call and attach a listener
    const adapter = mockHandleSocket.mock.calls[0]![0];
    const listener = vi.fn();
    adapter.addEventListener("message", listener);

    events.onMessage!({ data: '{"type":"subscribe"}' }, fakeWS);
    expect(listener).toHaveBeenCalledWith({ data: '{"type":"subscribe"}' });
  });

  it("onClose forwards code to adapter close listeners", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const factory = courierWSHandler();
    const ctx = createHonoContext(new Request("http://localhost/ws"));
    const events = factory(ctx);

    const fakeWS = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    events.onOpen!({}, fakeWS);

    const adapter = mockHandleSocket.mock.calls[0]![0];
    const listener = vi.fn();
    adapter.addEventListener("close", listener);

    events.onClose!({ code: 1000 }, fakeWS);
    expect(listener).toHaveBeenCalledWith({ code: 1000 });
  });

  it("adapter send delegates to Hono ws.send", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const factory = courierWSHandler();
    const ctx = createHonoContext(new Request("http://localhost/ws"));
    const events = factory(ctx);

    const fakeWS = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    events.onOpen!({}, fakeWS);

    const adapter = mockHandleSocket.mock.calls[0]![0];
    adapter.send("hello");
    expect(fakeWS.send).toHaveBeenCalledWith("hello");
  });
});

describe("the metadata courierWSHandler's hooks receive", () => {
  it("is typed from what onConnect returns", () => {
    const factory = courierWSHandler({
      onConnect: () => ({ userId: "u1" }),
      authorize: ({ meta }) => meta.userId.length > 0,
    });

    expect(factory).toBeTypeOf("function");
  });
});
