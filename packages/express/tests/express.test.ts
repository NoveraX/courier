import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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
import { courierHandler, courierSSEHandler, courierWSAttach } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);
const mockCreateWSHandler = vi.mocked(createWSHandler);

/**
 * The handlers read the core global registry when they serve a request, to
 * announce what they host. A stub dict is registered before each test so
 * that read finds one, whatever other test files left behind.
 */
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

  it("converts Node.js request and sends Web Standard response", async () => {
    const mockResponseBody = JSON.stringify({ data: "test" });
    const mockHandle = vi.fn().mockResolvedValue(
      new Response(mockResponseBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));

    const handler = courierHandler();

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

    const handler = courierHandler();

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

    const handler = courierHandler();
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

    const handler = courierHandler();
    const next = vi.fn();

    const { req, res } = createMockNodeRequestResponse({
      method: "GET",
      path: "/api/request?_s=api&_m=list",
    });

    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("sends 500 when no next function provided, and logs why", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("fail");
    const mockHandle = vi.fn().mockRejectedValue(failure);
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));
    const handler = courierHandler();

    try {
      const { status, body } = await makeNodeRequest(handler, {
        method: "GET",
        path: "/api/request?_s=api&_m=list",
      });

      expect(status).toBe(500);
      expect(JSON.parse(body)).toEqual({
        success: false,
        message: "Internal server error",
      });
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  /* Its head sent, the answer could not turn into a 500: writing one threw,
     and the middleware failed with it, the error behind it never logged. */
  it("cuts off an answer whose body breaks, when no next function is provided", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockHandle = vi.fn().mockResolvedValue(new Response(breakingBody()));
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handle: mockHandle }));
    const handler = courierHandler();
    let served: Promise<void> | undefined;
    const server = createServer((req, res) => {
      served = handler(req, res);
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address() as AddressInfo;

      const outcome = await fetch(`http://127.0.0.1:${port}/api/request?_s=api&_m=list`)
        .then((response) => response.text())
        .then(
          () => "whole",
          (error: unknown) => (error instanceof Error ? error.name : "unknown"),
        );

      expect(outcome).toBe("TypeError");
      await expect(served).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
      server.close();
    }
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

  it("converts request and delegates to handleSSE", async () => {
    const mockHandleSSE = vi.fn().mockResolvedValue(
      new Response("data: hello\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();

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
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      }),
    );
    mockCreateHandler.mockReturnValue(createMockHandlerResult({ handleSSE: mockHandleSSE }));

    const handler = courierSSEHandler();
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

    const handler = courierSSEHandler();
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

/** A body that sends its first chunk, then fails as an upstream that reset would. */
function breakingBody(): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    async pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(new TextEncoder().encode("first chunk\n"));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error("upstream reset mid-body");
    },
  });
}

type RequestOptions = {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

function createMockNodeRequestResponse(options: RequestOptions) {
  const server = createServer();
  const req = new (require("node:http").IncomingMessage)(new (require("node:net").Socket)());

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

  it("shares a single WSHandler across connections", () => {
    const server = createServer();
    courierWSAttach(server);
    courierWSAttach(server);

    // Each call creates its own handler
    expect(mockCreateWSHandler).toHaveBeenCalledTimes(2);
  });
});

describe("the metadata courierSSEHandler's hooks receive", () => {
  it("is typed from what onSSEConnect returns", () => {
    const handler = courierSSEHandler({
      onSSEConnect: async () => ({ userId: "u1" }),
      onSSEError: ({ meta }) => {
        const userId: string = meta.userId;
        expect(userId).toBeTypeOf("string");
      },
    });

    expect(handler).toBeTypeOf("function");
  });
});
