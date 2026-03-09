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
import { nexusMiddleware } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);

afterEach(() => {
  vi.clearAllMocks();
});

describe("nexusMiddleware", () => {
  it("returns a function", () => {
    const middleware = nexusMiddleware({} as any);
    expect(typeof middleware).toBe("function");
  });

  it("calls createHandler with sources", () => {
    const sources = { api: {} } as any;
    nexusMiddleware(sources);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources);
  });

  it("converts Node.js request to Web Standard Request and handles it", async () => {
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

    const middleware = nexusMiddleware({} as any);

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
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

    const middleware = nexusMiddleware({} as any);
    const next = vi.fn();

    const { Readable } = require("node:stream");
    const raw = new Readable({ read() { this.push(null); } });
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
    const middleware = nexusMiddleware({} as any);

    // Verify the middleware has the correct arity for NestJS
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
