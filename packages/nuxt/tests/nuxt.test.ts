import { afterEach, describe, expect, it, vi } from "vitest";
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
  };
});

import { createHandler } from "@noverax/courier";
import { courierHandler } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);

afterEach(() => {
  vi.clearAllMocks();
});

function getMockHandle() {
  return mockCreateHandler.mock.results[0]?.value.handle as ReturnType<typeof vi.fn>;
}

describe("courierHandler", () => {
  it("returns a function", () => {
    const handler = courierHandler();
    expect(typeof handler).toBe("function");
  });

  it("marks itself the way h3 1.x recognizes a handler", () => {
    expect(courierHandler().__is_handler__).toBe(true);
  });

  it("calls createHandler with no sources arg (zero-arg)", () => {
    courierHandler();
    expect(mockCreateHandler).toHaveBeenCalledWith(undefined);
  });

  it("forwards HandlerConfig (allowedOrigins) to createHandler", () => {
    const config = { allowedOrigins: ["https://app.example.com"] };
    courierHandler(config);
    expect(mockCreateHandler).toHaveBeenCalledWith(config);
  });

  it("hands the request an h3 2.x event carries to handle", async () => {
    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const handler = courierHandler();
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(new Response("{}"));

    await handler({ req: request });

    expect(mockHandle).toHaveBeenCalledWith(request);
  });

  it("hands over the Web request an h3 1.x event carries when h3 served one", async () => {
    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const handler = courierHandler();
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(new Response("{}"));

    await handler({ node: {} as never, web: { request } });

    expect(mockHandle).toHaveBeenCalledWith(request);
  });

  it("returns the Response from handle", async () => {
    const expectedResponse = new Response(JSON.stringify({ data: "test" }));
    const handler = courierHandler();
    getMockHandle().mockResolvedValue(expectedResponse);

    const result = await handler({ req: new Request("http://localhost/api/request") });

    expect(result).toBe(expectedResponse);
  });

  it("keeps a stream's proxy-buster headers on the response", async () => {
    const sseHeaders = {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    };
    const handler = courierHandler();
    getMockHandle().mockResolvedValue(
      new Response("data: hello\n\n", { status: 200, headers: sseHeaders }),
    );

    const result = await handler({ req: new Request("http://localhost/api/request?_s=api&_m=feed") });

    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(result.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(result.headers.get("connection")).toBe("keep-alive");
    expect(result.headers.get("x-accel-buffering")).toBe("no");
  });
});
