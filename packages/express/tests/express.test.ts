import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";

vi.mock("@noverax/nexus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@noverax/nexus")>();
  return {
    ...actual,
    createHandler: vi.fn(() => ({
      handle: vi.fn(),
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    })),
  };
});

import { createHandler } from "@noverax/nexus";
import { nexusHandler } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);

afterEach(() => {
  vi.clearAllMocks();
});

describe("nexusHandler", () => {
  it("returns a function", () => {
    const handler = nexusHandler({} as any);
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with sources", () => {
    const sources = { api: {} } as any;
    nexusHandler(sources);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources);
  });

  it("converts Node.js request and sends Web Standard response", async () => {
    const mockResponseBody = JSON.stringify({ data: "test" });
    const mockHandle = vi.fn().mockResolvedValue(
      new Response(mockResponseBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

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
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

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
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

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
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

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
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

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
