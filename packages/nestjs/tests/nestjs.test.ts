import { createServer } from "node:http";
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
import { courierMiddleware, courierSSEMiddleware, courierWSAttach } from "../src/index";

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

describe("courierMiddleware", () => {
  it("returns a function", () => {
    const middleware = courierMiddleware();
    expect(typeof middleware).toBe("function");
  });

  it("calls createHandler with no sources arg (zero-arg)", () => {
    courierMiddleware();
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const config = { allowedOrigins: ["https://app.example.com"] };
    courierMiddleware(config);
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("converts Node.js request to Web Standard Request and handles it", async () => {
    const mockResponseBody = JSON.stringify({ data: "test" });
    const mockHandle = vi.fn().mockResolvedValue(
      new Response(mockResponseBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const middleware = courierMiddleware();

    const { body, status, headers } = await makeNodeRequest(middleware, {
      method: "GET",
      path: "/api/request?_s=api&_m=list",
    });

    expect(status).toBe(200);
    expect(headers?.["content-type"]).toBe("application/json");
    expect(JSON.parse(body)).toEqual({ data: "test" });
    expect(mockHandle).toHaveBeenCalledWith(expect.any(Request));
  });

  it("calls next(error) on failure", async () => {
    const error = new Error("test error");
    const mockHandle = vi.fn().mockRejectedValue(error);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const middleware = courierMiddleware();
    const next = vi.fn();

    const { Readable } = require("node:stream");
    const raw = new Readable({
      read() {
        this.push(null);
      },
    });
    raw.method = "GET";
    raw.url = "/api/request?_s=api&_m=list";
    raw.headers = { host: "localhost" };
    raw.socket = { encrypted: false };

    const { ServerResponse } = require("node:http");
    const res = new ServerResponse(raw);

    await middleware(raw, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("works as NestJS-compatible middleware (req, res, next signature)", () => {
    const middleware = courierMiddleware();

    // Verify the middleware has the correct arity for NestJS
    expect(middleware.length).toBe(3);
  });
});

describe("courierSSEMiddleware", () => {
  it("returns a function", () => {
    const middleware = courierSSEMiddleware();
    expect(typeof middleware).toBe("function");
  });

  it("calls createHandler with no sources arg (zero-arg)", () => {
    courierSSEMiddleware();
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const config = { sseHeaders: { "Access-Control-Allow-Origin": "*" }, sseMaxLifetimeMs: 60_000 };
    courierSSEMiddleware(config);
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("converts request and delegates to handleSSE", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const middleware = courierSSEMiddleware();

    const { status, headers } = await makeNodeRequest(middleware, {
      method: "GET",
      path: "/api/sse?_s=api&_m=feed",
    });

    expect(status).toBe(200);
    expect(headers?.["content-type"]).toBe("text/event-stream");
    expect(mockHandleSSE).toHaveBeenCalledWith(expect.any(Request));
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

    const middleware = courierSSEMiddleware();
    const { status, headers } = await makeNodeRequest(middleware, {
      method: "GET",
      path: "/api/sse?_s=api&_m=feed",
    });

    expect(status).toBe(200);
    expect(headers?.["content-type"]).toBe("text/event-stream");
    expect(headers?.["cache-control"]).toBe("no-cache, no-transform");
    expect(headers?.["x-accel-buffering"]).toBe("no");
  });

  it("calls next(error) on failure", async () => {
    const error = new Error("sse error");
    const mockHandleSSE = vi.fn().mockRejectedValue(error);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const middleware = courierSSEMiddleware();
    const next = vi.fn();

    const { Readable } = require("node:stream");
    const raw = new Readable({
      read() {
        this.push(null);
      },
    });
    raw.method = "GET";
    raw.url = "/api/sse?_s=api&_m=feed";
    raw.headers = { host: "localhost" };
    raw.socket = { encrypted: false };

    const { ServerResponse } = require("node:http");
    const res = new ServerResponse(raw);

    await middleware(raw, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("has correct arity for NestJS (3 params)", () => {
    const middleware = courierSSEMiddleware();
    expect(middleware.length).toBe(3);
  });
});

// --- Test helpers ---

type RequestOptions = {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

function makeNodeRequest(
  handler: (req: any, res: any, next: any) => Promise<void>,
  options: RequestOptions,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const next = (err?: unknown) => {
        if (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      };
      try {
        await handler(req, res, next);
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    server.listen(0, () => {
      const address = server.address() as { port: number };
      const url = `http://localhost:${address.port}${options.path}`;

      const fetchInit: RequestInit = {
        method: options.method,
        headers: { host: "localhost", ...(options.headers ?? {}) },
      };

      if (options.body) {
        fetchInit.body = options.body;
      }

      fetch(url, fetchInit)
        .then(async (res) => {
          const body = await res.text();
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          resolve({ status: res.status, headers, body });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

describe("courierWSAttach", () => {
  it("returns a cleanup function", () => {
    const server = createServer();
    const cleanup = courierWSAttach(server);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("calls createWSHandler with just the options (no sources)", () => {
    const options = { heartbeatIntervalMs: 5000 };
    const server = createServer();
    const cleanup = courierWSAttach(server, options);
    expect(mockCreateWSHandler).toHaveBeenCalledWith(options);
    cleanup();
  });

  it("attaches upgrade listener to server", () => {
    const server = createServer();
    const onSpy = vi.spyOn(server, "on");
    const cleanup = courierWSAttach(server);

    expect(onSpy).toHaveBeenCalledWith("upgrade", expect.any(Function));
    cleanup();
    onSpy.mockRestore();
  });

  it("cleanup removes upgrade listener", () => {
    const server = createServer();
    const offSpy = vi.spyOn(server, "off");
    const cleanup = courierWSAttach(server);

    cleanup();
    expect(offSpy).toHaveBeenCalledWith("upgrade", expect.any(Function));
    offSpy.mockRestore();
  });
});
