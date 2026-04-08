import { afterEach, describe, expect, it, vi } from "vitest";
import type * as NexusModule from "@noverax/nexus";

vi.mock("@noverax/nexus", async (importOriginal) => {
  const actual = await importOriginal<typeof NexusModule>();
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

import { createHandler, createWSHandler } from "@noverax/nexus";
import { nexusPlugin, nexusSSEHandler, nexusWSHandler } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);
const mockCreateWSHandler = vi.mocked(createWSHandler);

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

describe("nexusPlugin", () => {
  it("is an async function (Fastify plugin)", () => {
    expect(typeof nexusPlugin).toBe("function");
  });

  it("calls createHandler with sources", async () => {
    const sources = { api: {} } as any;
    const fastify = createMockFastify();

    await nexusPlugin(fastify, { sources });
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, undefined);
  });

  it("forwards HandlerConfig to createHandler", async () => {
    const sources = { api: {} } as any;
    const config = { allowedOrigins: ["https://app.example.com"] };
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources, config });
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, config);
  });

  it("registers a catch-all route", async () => {
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any });

    expect(fastify.all).toHaveBeenCalledWith("/*", expect.any(Function));
  });

  it("registers a prefixed route when prefix is provided", async () => {
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any, prefix: "/api/request" });

    expect(fastify.all).toHaveBeenCalledWith("/api/request/*", expect.any(Function));
  });

  it("removes default content type parsers", async () => {
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any });

    expect(fastify.removeAllContentTypeParsers).toHaveBeenCalled();
    expect(fastify.addContentTypeParser).toHaveBeenCalledWith(
      "*",
      expect.any(Function),
    );
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
    await nexusPlugin(fastify, { sources: {} as any });

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

describe("nexusSSEHandler", () => {
  it("returns a function", () => {
    const handler = nexusSSEHandler({} as any);
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with sources", () => {
    const sources = { api: {} } as any;
    nexusSSEHandler(sources);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const sources = { api: {} } as any;
    const config = { sseHeaders: { "Access-Control-Allow-Origin": "*" }, sseMaxLifetimeMs: 60_000 };
    nexusSSEHandler(sources, config);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, config);
  });

  it("calls handleSSE and hijacks reply", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = nexusSSEHandler({} as any);
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
          "connection": "keep-alive",
          "x-accel-buffering": "no",
        },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = nexusSSEHandler({} as any);
    const mockReq = createMockFastifyRequest({ method: "GET", url: "/api/sse?_s=api&_m=feed" });
    const { raw, hijack } = createMockFastifyReply();

    await handler(mockReq, { raw, hijack } as any);

    // sendWebResponse calls res.writeHead(status, headersObj)
    expect(raw.writeHead).toHaveBeenCalledTimes(1);
    const [status, headers] = (raw.writeHead as any).mock.calls[0];
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/event-stream");
    expect(headers["cache-control"]).toBe("no-cache, no-transform");
    expect(headers["connection"]).toBe("keep-alive");
    expect(headers["x-accel-buffering"]).toBe("no");
  });

  it("calls hijack before sending response", async () => {
    const callOrder: string[] = [];
    const mockHandleSSE = vi.fn().mockResolvedValue(new Response(""));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = nexusSSEHandler({} as any);
    const mockReq = createMockFastifyRequest({ method: "GET", url: "/api/sse?_s=api&_m=feed" });
    const hijack = vi.fn(() => callOrder.push("hijack"));
    const raw = {
      writeHead: vi.fn(() => callOrder.push("writeHead")),
      write: vi.fn(),
      end: vi.fn(),
    };

    await handler(mockReq, { raw, hijack } as any);

    expect(callOrder[0]).toBe("hijack");
  });
});

// --- Test helpers ---

function createMockFastify() {
  return {
    all: vi.fn(),
    removeAllContentTypeParsers: vi.fn(),
    addContentTypeParser: vi.fn((_type: string, handler: Function) => {
      handler({}, null, vi.fn());
    }),
  } as any;
}

function createMockFastifyRequest(options: { method: string; url: string }) {
  const { Readable } = require("node:stream");
  const raw = new Readable({ read() { this.push(null); } });
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
  };
  const hijack = vi.fn();

  return { raw, hijack, chunks };
}

// --- WebSocket tests ---

describe("nexusWSHandler", () => {
  it("returns a handler function", () => {
    const handler = nexusWSHandler({} as any);
    expect(typeof handler).toBe("function");
  });

  it("calls createWSHandler with sources and options", () => {
    const sources = { api: {} } as any;
    const options = { heartbeatIntervalMs: 5000, allowedOrigins: ["http://localhost"] };
    nexusWSHandler(sources, options);
    expect(mockCreateWSHandler).toHaveBeenCalledWith({ sources, ...options });
  });

  it("calls handleSocket with socket and converted request", () => {
    const mockHandleSocket = vi.fn();
    mockCreateWSHandler.mockReturnValue(createMockWSResult(mockHandleSocket));

    const handler = nexusWSHandler({} as any);
    const mockSocket = { send: vi.fn(), close: vi.fn(), readyState: 1, bufferedAmount: 0 } as any;
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

    const handler = nexusWSHandler({} as any);
    const socket1 = { send: vi.fn(), close: vi.fn(), readyState: 1, bufferedAmount: 0 } as any;
    const socket2 = { send: vi.fn(), close: vi.fn(), readyState: 1, bufferedAmount: 0 } as any;
    const req = createMockFastifyRequest({ method: "GET", url: "/ws" });

    handler(socket1, req);
    handler(socket2, req);

    expect(mockHandleSocket).toHaveBeenCalledTimes(2);
    // Same createWSHandler call — one handler, multiple sockets
    expect(mockCreateWSHandler).toHaveBeenCalledTimes(1);
  });
});
