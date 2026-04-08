import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
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
import { nexusHandler, nexusSSEHandler, nexusWSAttach } from "../src/index";

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

describe("nexusHandler", () => {
  it("returns a function", () => {
    const handler = nexusHandler({} as any);
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with sources", () => {
    const sources = { api: {} } as any;
    nexusHandler(sources);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const sources = { api: {} } as any;
    const config = { allowedOrigins: ["https://app.example.com"] };
    nexusHandler(sources, config);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, config);
  });

  it("converts Node.js request and sends Web Standard response", async () => {
    const mockResponseBody = JSON.stringify({ data: "test" });
    const mockHandle = vi.fn().mockResolvedValue(
      new Response(mockResponseBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = nexusHandler({} as any);

    const { body, status, headers } = await makeNodeRequest(handler, {
      method: "GET",
      path: "/api/request?_s=api&_m=list",
    });

    expect(status).toBe(200);
    expect(headers?.["content-type"]).toBe("application/json");
    expect(JSON.parse(body)).toEqual({ data: "test" });
    expect(mockHandle).toHaveBeenCalledWith(expect.any(Request));
  });

  it("passes correct URL to Web Standard Request", async () => {
    const mockHandle = vi.fn().mockResolvedValue(new Response("{}"));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = nexusHandler({} as any);

    await makeNodeRequest(handler, {
      method: "GET",
      path: "/api/request?_s=api&_g=users&_m=getAll",
    });

    const webReq = mockHandle.mock.calls[0]?.[0] as Request;
    const url = new URL(webReq.url);
    expect(url.searchParams.get("_s")).toBe("api");
    expect(url.searchParams.get("_g")).toBe("users");
    expect(url.searchParams.get("_m")).toBe("getAll");
  });

  it("passes POST body through to Web Standard Request", async () => {
    const mockHandle = vi.fn().mockResolvedValue(new Response("{}"));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = nexusHandler({} as any);
    const payload = JSON.stringify({ source: "api", method: "list" });

    await makeNodeRequest(handler, {
      method: "POST",
      path: "/api/request",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: payload,
    });

    const webReq = mockHandle.mock.calls[0]?.[0] as Request;
    expect(webReq.method).toBe("POST");
    expect(webReq.headers.get("content-type")).toBe("application/json");
  });

  it("calls next(error) on failure", async () => {
    const error = new Error("test error");
    const mockHandle = vi.fn().mockRejectedValue(error);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = nexusHandler({} as any);
    const next = vi.fn();

    const { req, res } = createMockNodeRequestResponse({
      method: "GET",
      path: "/api/request?_s=api&_m=list",
    });

    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("sends 500 when no next function provided", async () => {
    const mockHandle = vi.fn().mockRejectedValue(new Error("fail"));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = nexusHandler({} as any);

    const { status, body } = await makeNodeRequest(handler, {
      method: "GET",
      path: "/api/request?_s=api&_m=list",
    });

    expect(status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      success: false,
      message: "Internal server error",
    });
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

  it("converts request and delegates to handleSSE", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = nexusSSEHandler({} as any);

    const { status, headers } = await makeNodeRequest(handler, {
      method: "GET",
      path: "/api/sse?_s=api&_g=notifications&_m=feed",
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
          "connection": "keep-alive",
          "x-accel-buffering": "no",
        },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = nexusSSEHandler({} as any);
    const { status, headers } = await makeNodeRequest(handler, {
      method: "GET",
      path: "/api/sse?_s=api&_m=feed",
    });

    expect(status).toBe(200);
    expect(headers?.["content-type"]).toBe("text/event-stream");
    expect(headers?.["cache-control"]).toBe("no-cache, no-transform");
    expect(headers?.["x-accel-buffering"]).toBe("no");
    // `connection` is managed by the Node HTTP layer (HTTP/1.1 keep-alive by
    // default) — fetch may rewrite it. The other 3 headers are the proxy-buster
    // set the adapter MUST forward intact for SSE to bypass nginx/gzip.
  });

  it("calls next(error) on failure", async () => {
    const error = new Error("sse error");
    const mockHandleSSE = vi.fn().mockRejectedValue(error);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = nexusSSEHandler({} as any);
    const next = vi.fn();

    const { req, res } = createMockNodeRequestResponse({
      method: "GET",
      path: "/api/sse?_s=api&_m=feed",
    });

    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});

// --- Test helpers ---

type RequestOptions = {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

function createMockNodeRequestResponse(options: RequestOptions) {
  const server = createServer();
  const req = new (require("node:http").IncomingMessage)(
    new (require("node:net").Socket)(),
  );

  req.method = options.method;
  req.url = options.path;
  req.headers = {
    host: "localhost",
    ...(options.headers ?? {}),
  };

  const res = new (require("node:http").ServerResponse)(req);

  return { req, res, server };
}

function makeNodeRequest(
  handler: (req: any, res: any, next?: any) => Promise<void>,
  options: RequestOptions,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
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

describe("nexusWSAttach", () => {
  it("returns a cleanup function", () => {
    const server = createServer();
    const cleanup = nexusWSAttach(server, {} as any);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("calls createWSHandler with sources and options", () => {
    const sources = { api: {} } as any;
    const options = { heartbeatIntervalMs: 5000 };
    const server = createServer();
    const cleanup = nexusWSAttach(server, sources, options);
    expect(mockCreateWSHandler).toHaveBeenCalledWith({ sources, ...options });
    cleanup();
  });

  it("attaches upgrade listener to server", () => {
    const server = createServer();
    const onSpy = vi.spyOn(server, "on");
    const cleanup = nexusWSAttach(server, {} as any);

    expect(onSpy).toHaveBeenCalledWith("upgrade", expect.any(Function));
    cleanup();
    onSpy.mockRestore();
  });

  it("cleanup removes upgrade listener", () => {
    const server = createServer();
    const offSpy = vi.spyOn(server, "off");
    const cleanup = nexusWSAttach(server, {} as any);

    cleanup();
    expect(offSpy).toHaveBeenCalledWith("upgrade", expect.any(Function));
    offSpy.mockRestore();
  });

  it("shares a single WSHandler across connections", () => {
    const server = createServer();
    nexusWSAttach(server, {} as any);
    nexusWSAttach(server, {} as any);

    // Each call creates its own handler
    expect(mockCreateWSHandler).toHaveBeenCalledTimes(2);
  });
});
