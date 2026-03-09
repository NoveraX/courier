import { afterEach, describe, expect, it, vi } from "vitest";

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

function createHonoContext(request: Request) {
  return {
    req: { raw: request },
  } as any;
}

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

  it("passes c.req.raw to handle", async () => {
    const mockHandle = vi.fn().mockResolvedValue(new Response("{}"));
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

    const handler = nexusHandler({} as any);
    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const ctx = createHonoContext(request);

    await handler(ctx);

    expect(mockHandle).toHaveBeenCalledWith(request);
  });

  it("returns the Response from handle", async () => {
    const expectedResponse = new Response(JSON.stringify({ data: "test" }));
    const mockHandle = vi.fn().mockResolvedValue(expectedResponse);
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

    const handler = nexusHandler({} as any);
    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const ctx = createHonoContext(request);

    const result = await handler(ctx);
    expect(result).toBe(expectedResponse);
  });

  it("handles POST requests via handle", async () => {
    const mockHandle = vi.fn().mockResolvedValue(new Response("{}"));
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

    const handler = nexusHandler({} as any);
    const request = new Request("http://localhost/api/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({ source: "api", method: "list" }),
    });
    const ctx = createHonoContext(request);

    await handler(ctx);

    expect(mockHandle).toHaveBeenCalledWith(request);
  });
});
