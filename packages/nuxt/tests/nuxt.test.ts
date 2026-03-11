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

vi.mock("h3", () => ({
  fromWebHandler: vi.fn((handler: Function) => handler),
}));

import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
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
    const handler = nexusHandler({} as Sources);
    expect(typeof handler).toBe("function");
  });

  it("calls createHandler with sources", () => {
    const sources = { api: {} } as Sources;
    nexusHandler(sources);
    expect(mockCreateHandler).toHaveBeenCalledWith(sources);
  });

  it("wraps handler with fromWebHandler", () => {
    nexusHandler({} as Sources);
    expect(mockFromWebHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it("delegates to handle with the request", async () => {
    const webRequest = new Request("http://localhost/api/request?_s=api&_m=list");

    // fromWebHandler is mocked to passthrough — handler accepts Request at runtime
    const handler = nexusHandler({} as Sources) as unknown as (req: Request) => Promise<Response>;
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(new Response("{}"));

    await handler(webRequest);

    expect(mockHandle).toHaveBeenCalledWith(webRequest);
  });

  it("returns the Response from handle", async () => {
    const expectedResponse = new Response(JSON.stringify({ data: "test" }));

    const handler = nexusHandler({} as Sources) as unknown as (req: Request) => Promise<Response>;
    const mockHandle = getMockHandle();
    mockHandle.mockResolvedValue(expectedResponse);

    const request = new Request("http://localhost/api/request?_s=api&_m=list");
    const result = await handler(request);
    expect(result).toBe(expectedResponse);
  });
});
