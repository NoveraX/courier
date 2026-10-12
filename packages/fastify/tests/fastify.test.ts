import type * as CourierModule from "@noverax/courier";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@noverax/courier", async (importOriginal) => {
  const actual = await importOriginal<typeof CourierModule>();
  return {
    ...actual,
    createHandler: vi.fn(() => ({
      handle: vi.fn(),
      handleGet: vi.fn(),
      handlePost: vi.fn(),
      handleSSE: vi.fn(),
      sseConnections: {
        count: 0,
        isShuttingDown: false,
        get: vi.fn(),
        has: vi.fn(),
        list: vi.fn(() => []),
        getByMeta: vi.fn(() => []),
        getByEndpoint: vi.fn(() => []),
        disconnect: vi.fn(),
        disconnectAll: vi.fn(),
        send: vi.fn(() => true),
        broadcastToEndpoint: vi.fn(() => new Map()),
        broadcastToMeta: vi.fn(() => new Map()),
        broadcastAll: vi.fn(() => new Map()),
      },
      shutdownSSE: vi.fn(),
    })),
    createWSHandler: vi.fn(() => ({
      handleSocket: vi.fn(),
      connections: {
        count: 0,
        get: vi.fn(),
        has: vi.fn(),
        list: vi.fn(() => []),
        getByMeta: vi.fn(() => []),
        send: vi.fn(),
        broadcast: vi.fn(),
        broadcastToTopic: vi.fn(),
        broadcastToBaseTopic: vi.fn(),
        sendToConnection: vi.fn(),
        disconnect: vi.fn(),
        disconnectByMeta: vi.fn(),
      },
      destroy: vi.fn(),
    })),
  };
});

import { createHandler, createWSHandler, registerSources } from "@noverax/courier";
import { courierPlugin, courierSSEHandler, courierWSHandler } from "../src/index";

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
    sseConnections: {
      count: 0,
      isShuttingDown: false,
      get: vi.fn(),
      has: vi.fn(),
      list: vi.fn(() => []),
      getByMeta: vi.fn(() => []),
      getByEndpoint: vi.fn(() => []),
      disconnect: vi.fn(),
      disconnectAll: vi.fn(),
      send: vi.fn(() => true),
      broadcastToEndpoint: vi.fn(() => new Map()),
      broadcastToMeta: vi.fn(() => new Map()),
      broadcastAll: vi.fn(() => new Map()),
    },
    shutdownSSE: vi.fn(),
    ...overrides,
  };
}

function createMockWSResult(handleSocket = vi.fn()) {
  return {
    handleSocket,
    connections: {
      count: 0,
      get: vi.fn(),
      has: vi.fn(),
      list: vi.fn(() => []),
      getByMeta: vi.fn(() => []),
      send: vi.fn(),
      broadcast: vi.fn(),
      broadcastToTopic: vi.fn(),
      broadcastToBaseTopic: vi.fn(),
      sendToConnection: vi.fn(),
      disconnect: vi.fn(),
      disconnectByMeta: vi.fn(),
    },
    destroy: vi.fn(),
  };
}

describe("courierPlugin", () => {
  it("is an async function (Fastify plugin)", () => {
    expect(typeof courierPlugin).toBe("function");
  });

  it("calls createHandler with no sources arg (zero-arg)", async () => {
    const fastify = createMockFastify();
    await courierPlugin(fastify, {});
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig to createHandler", async () => {
    const config = { allowedOrigins: ["https://app.example.com"] };
    const fastify = createMockFastify();
    await courierPlugin(fastify, { config });
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("registers the proxy where the caller looks by default when no prefix is given", async () => {
    const fastify = createMockFastify();
    await courierPlugin(fastify, {});

    expect(fastify.all).toHaveBeenCalledTimes(1);
    expect(fastify.all).toHaveBeenCalledWith("/api/request", expect.any(Function));
  });

  /* Fastify applies `prefix` to everything a plugin registers, so the paths
     the plugin asks for are relative and must not repeat it. Asserting the
     prefixed string here is what let the proxy sit at
     `/api/request/api/request/*` while this file stayed green. */
  it("registers only the prefix itself, relative, when a prefix is provided", async () => {
    const fastify = createMockFastify();
    await courierPlugin(fastify, { prefix: "/api/request" });

    expect(fastify.all).toHaveBeenCalledTimes(1);
    expect(fastify.all).toHaveBeenCalledWith("/", expect.any(Function));
  });

  it("removes default content type parsers", async () => {
    const fastify = createMockFastify();
    await courierPlugin(fastify, {});

    expect(fastify.removeAllContentTypeParsers).toHaveBeenCalled();
    expect(fastify.addContentTypeParser).toHaveBeenCalledWith("*", expect.any(Function));
  });

  it("converts request and sends response via handler", async () => {
    const mockHandle = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const fastify = createMockFastify();
    await courierPlugin(fastify, {});

    const routeHandler = (fastify.all as any).mock.calls[0][1];

    const mockReq = createMockFastifyRequest({
      method: "GET",
      url: "/api/request?_s=api&_m=list",
    });

    const { raw: rawRes, hijack } = createMockFastifyReply();

    await routeHandler(mockReq, { raw: rawRes, hijack });

    expect(mockHandle).toHaveBeenCalledWith(expect.any(Request));
    expect(hijack).toHaveBeenCalled();
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

  it("calls handleSSE and hijacks reply", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
    const mockReq = createMockFastifyRequest({
      method: "GET",
      url: "/api/sse?_s=api&_m=feed",
    });
    const { raw: rawRes, hijack } = createMockFastifyReply();

    await handler(mockReq, { raw: rawRes, hijack } as any);

    expect(mockHandleSSE).toHaveBeenCalledWith(expect.any(Request));
    expect(hijack).toHaveBeenCalled();
  });

  it("preserves all SSE response headers through the adapter", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
    const mockReq = createMockFastifyRequest({ method: "GET", url: "/api/sse?_s=api&_m=feed" });
    const { raw, hijack } = createMockFastifyReply();

    await handler(mockReq, { raw, hijack } as any);

    // sendWebResponse calls res.writeHead(status, headersObj)
    expect(raw.writeHead).toHaveBeenCalledTimes(1);
    const [status, headers] = (raw.writeHead as any).mock.calls[0];
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/event-stream");
    expect(headers["cache-control"]).toBe("no-cache, no-transform");
    expect(headers.connection).toBe("keep-alive");
    expect(headers["x-accel-buffering"]).toBe("no");
  });

  it("calls hijack before sending response", async () => {
    const callOrder: string[] = [];
    const mockHandleSSE = vi.fn().mockResolvedValue(new Response(""));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
    const mockReq = createMockFastifyRequest({ method: "GET", url: "/api/sse?_s=api&_m=feed" });
    const hijack = vi.fn(() => callOrder.push("hijack"));
    const raw = {
      writeHead: vi.fn(() => callOrder.push("writeHead")),
      write: vi.fn(),
      end: vi.fn(),
      getHeader: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      writableFinished: false,
    };

    await handler(mockReq, { raw, hijack } as any);

    expect(callOrder[0]).toBe("hijack");
  });
});

// --- Test helpers ---

function createMockFastify() {
  return {
    all: vi.fn(),
    addHook: vi.fn(),
    removeAllContentTypeParsers: vi.fn(),
    addContentTypeParser: vi.fn((_type: string, handler: Function) => {
      handler({}, null, vi.fn());
    }),
  } as any;
}

function createMockFastifyRequest(options: { method: string; url: string }) {
  const { Readable } = require("node:stream");
  const raw = new Readable({
    read() {
      this.push(null);
    },
  });
  raw.method = options.method;
  raw.url = options.url;
  raw.headers = { host: "localhost" };
  raw.socket = { encrypted: false };

  return { raw } as any;
}

function createMockFastifyReply() {
  const chunks: Buffer[] = [];
  const raw = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: any) => chunks.push(Buffer.from(chunk))),
    end: vi.fn(),
    /* The adapter keeps a `Vary` set before the answer beside the answer's own. */
    getHeader: vi.fn(),
    /* A ServerResponse is an event emitter; the adapter listens for an early close. */
    once: vi.fn(),
    off: vi.fn(),
    writableFinished: false,
  };
  const hijack = vi.fn();

  return { raw, hijack, chunks };
}

// --- WebSocket tests ---

describe("courierWSHandler", () => {
  it("returns a handler function", () => {
    const handler = courierWSHandler();
    expect(typeof handler).toBe("function");
  });

  it("calls createWSHandler with just the options (no sources)", () => {
    const options = { heartbeatIntervalMs: 5000, allowedOrigins: ["http://localhost"] };
    courierWSHandler(options);
    expect(mockCreateWSHandler).toHaveBeenCalledWith(options);
  });

  it("calls handleSocket with socket and converted request", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const handler = courierWSHandler();
    const mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      readyState: 1,
      bufferedAmount: 0,
    } as any;
    const request = createMockFastifyRequest({ method: "GET", url: "/ws" });

    handler(mockSocket, request);

    expect(mockHandleSocket).toHaveBeenCalledTimes(1);
    expect(mockHandleSocket.mock.calls[0]![0]).toBe(mockSocket);
    // Second arg is the converted Web Request
    expect(mockHandleSocket.mock.calls[0]![1]).toBeInstanceOf(Request);
  });

  it("shares handler across multiple connections", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const handler = courierWSHandler();
    const socket1 = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      readyState: 1,
      bufferedAmount: 0,
    } as any;
    const socket2 = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      readyState: 1,
      bufferedAmount: 0,
    } as any;
    const req = createMockFastifyRequest({ method: "GET", url: "/ws" });

    handler(socket1, req);
    handler(socket2, req);

    expect(mockHandleSocket).toHaveBeenCalledTimes(2);
    // Same createWSHandler call — one handler, multiple sockets
    expect(mockCreateWSHandler).toHaveBeenCalledTimes(1);
  });
});
