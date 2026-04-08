import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as NexusModule from "@noverax/nexus";

const mockHandleSSE = vi.fn();

vi.mock("@noverax/nexus", async (importOriginal) => {
  const actual = await importOriginal<typeof NexusModule>();
  return {
    ...actual,
    createHandler: vi.fn(() => ({
      handle: vi.fn(),
      handleGet: vi.fn(),
      handlePost: vi.fn(),
      handleSSE: mockHandleSSE,
      sseConnections: { count: 0, isShuttingDown: false, get: vi.fn(), has: vi.fn(), list: vi.fn(() => []), getByMeta: vi.fn(() => []), getByEndpoint: vi.fn(() => []), disconnect: vi.fn(), disconnectAll: vi.fn(), send: vi.fn(() => true), broadcastToEndpoint: vi.fn(() => new Map()), broadcastToMeta: vi.fn(() => new Map()), broadcastAll: vi.fn(() => new Map()) },
      shutdownSSE: vi.fn(),
    })),
  };
});

import { createHandler } from "@noverax/nexus";
import { sseRoute } from "../src/sse-route";

const mockCreateHandler = vi.mocked(createHandler);

afterEach(() => {
  vi.clearAllMocks();
});

describe("sseRoute", () => {
  it("returns { GET } handler", () => {
    const route = sseRoute({});
    expect(route.GET).toBeDefined();
    expect(typeof route.GET).toBe("function");
  });

  it("does not expose POST handler", () => {
    const route = sseRoute({}) as Record<string, unknown>;
    expect(route.POST).toBeUndefined();
  });

  it("calls createHandler with sources", () => {
    const sources = { api: {} } as any;
    sseRoute(sources);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, undefined);
  });

  it("forwards HandlerConfig to createHandler", () => {
    const sources = { api: {} } as any;
    const config = { sseHeaders: { "Access-Control-Allow-Origin": "*" }, sseMaxLifetimeMs: 60_000 };
    sseRoute(sources, config);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources, config);
  });

  it("delegates GET to handleSSE", async () => {
    const sseResponse = new Response("data: hello\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    mockHandleSSE.mockResolvedValue(sseResponse);

    const { GET } = sseRoute({ api: {} } as any);
    const req = new NextRequest(
      "http://localhost:3000/api/sse?_s=api&_g=notifications&_m=feed",
    );

    const result = await GET(req);

    expect(mockHandleSSE).toHaveBeenCalledWith(req);
    expect(result).toBe(sseResponse);
  });

  it("preserves all SSE response headers through the adapter", async () => {
    mockHandleSSE.mockResolvedValue(
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

    const { GET } = sseRoute({});
    const req = new NextRequest("http://localhost:3000/api/sse?_s=api&_m=feed");
    const res = await GET(req);

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("returns SSE content-type in response", async () => {
    mockHandleSSE.mockResolvedValue(
      new Response("data: test\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const { GET } = sseRoute({});
    const req = new NextRequest("http://localhost:3000/api/sse?_s=api&_m=feed");
    const res = await GET(req);

    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("passes NextRequest which extends Request", async () => {
    mockHandleSSE.mockResolvedValue(new Response(""));

    const { GET } = sseRoute({});
    const req = new NextRequest("http://localhost:3000/api/sse?_s=api&_m=feed");
    await GET(req);

    const passedReq = mockHandleSSE.mock.calls[0]?.[0];
    expect(passedReq).toBeInstanceOf(NextRequest);
    expect(passedReq).toBeInstanceOf(Request);
  });
});
