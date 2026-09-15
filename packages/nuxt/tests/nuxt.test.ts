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
  };
});

vi.mock("h3", () => ({
  fromWebHandler: vi.fn((handler: Function) => handler),
}));

import { createHandler } from "@noverax/nexus";
import { fromWebHandler } from "h3";
import { nexusHandler } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);
const mockFromWebHandler = vi.mocked(fromWebHandler);

afterEach(() => {
  vi.clearAllMocks();
});

function getMockHandle() {
  return mockCreateHandler.mock.results[0]?.value.handle as ReturnType<typeof vi.fn>;
}

describe("nexusHandler", () => {
  it("returns a function", () => {
    const handler = nexusHandler();
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with no sources arg (zero-arg)", () => {
    nexusHandler();
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig (allowedOrigins) to createHandler", () => {
    const config = { allowedOrigins: ["https://app.example.com"] };
    nexusHandler(config);
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("wraps handler with fromWebHandler", () => {
    nexusHandler();
    expect(mockFromWebHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it("delegates to handle with the request", async () => {
    const webRequest = new Request("http://localhost/api/request?_s=api&_m=list");

    // fromWebHandler is mocked to passthrough — handler accepts Request at runtime
    const handler = nexusHandler() as unknown as (req: Request) => Promise<Response>;
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(new Response("{}"));

    await handler(webRequest);

    expect(mockHandle).toHaveBeenCalledWith(webRequest);
  });

  it("returns the Response from handle", async () => {
    const expectedResponse = new Response(JSON.stringify({ data: "test" }));

    const handler = nexusHandler() as unknown as (req: Request) => Promise<Response>;
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(expectedResponse);

    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const result = await handler(request);
    expect(result).toBe(expectedResponse);
  });

  it("preserves all response headers (incl. SSE proxy-busters) through the adapter", async () => {
    // Nuxt adapter is HTTP-only today (see frameworks/nuxt.mdx → "Realtime").
    // This test still asserts the HTTP path doesn't strip the SSE-class
    // proxy-buster headers, so when nexusSSEHandler ships for Nuxt the
    // existing transport stays honest. Note: fromWebHandler is mocked to
    // passthrough, so this exercises the adapter wiring, not h3 itself —
    // a real h3 integration test requires booting Nitro and is out of scope.
    const sseHeaders = {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    };
    const handler = nexusHandler() as unknown as (req: Request) => Promise<Response>;
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(new Response("data: hello\n\n", { status: 200, headers: sseHeaders }));

    const result = await handler(new Request("http://localhost/api/request?_s=api&_m=feed"));

    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(result.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(result.headers.get("connection")).toBe("keep-alive");
    expect(result.headers.get("x-accel-buffering")).toBe("no");
  });
});
