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
import { nexusPlugin } from "../src/index";

const mockCreateHandler = vi.mocked(createHandler);

afterEach(() => {
  vi.clearAllMocks();
});

describe("nexusPlugin", () => {
  it("is an async function (Fastify plugin)", () => {
    expect(typeof nexusPlugin).toBe("function");
  });

  it("calls createHandler with sources", async () => {
    const sources = { api: {} } as any;
    const fastify = createMockFastify();

    await nexusPlugin(fastify, { sources });
    expect(mockCreateHandler).toHaveBeenCalledWith(sources);
  });

  it("registers a catch-all route", async () => {
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any });

    expect(fastify.all).toHaveBeenCalledWith("/*", expect.any(Function));
  });

  it("registers a prefixed route when prefix is provided", async () => {
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any, prefix: "/api/request" });

    expect(fastify.all).toHaveBeenCalledWith("/api/request/*", expect.any(Function));
  });

  it("removes default content type parsers", async () => {
    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any });

    expect(fastify.removeAllContentTypeParsers).toHaveBeenCalled();
    expect(fastify.addContentTypeParser).toHaveBeenCalledWith(
      "*",
      expect.any(Function),
    );
  });

  it("converts request and sends response via handler", async () => {
    const mockHandle = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockCreateHandler.mockReturnValue({
      handle: mockHandle,
      handleGet: vi.fn(),
      handlePost: vi.fn(),
    });

    const fastify = createMockFastify();
    await nexusPlugin(fastify, { sources: {} as any });

    const routeHandler = (fastify.all as any).mock.calls[0][1];

    const mockReq = createMockFastifyRequest({
      method: "GET",
      url: "/api/request?_s=api&_m=list",
    });

    const { raw: rawRes, hijack } = createMockFastifyReply();

    await routeHandler(mockReq, { raw: rawRes, hijack });

    expect(mockHandle).toHaveBeenCalledWith(expect.any(Request));
    expect(hijack).toHaveBeenCalled();
  });
});

// --- Test helpers ---

function createMockFastify() {
  return {
    all: vi.fn(),
    removeAllContentTypeParsers: vi.fn(),
    addContentTypeParser: vi.fn((_type: string, handler: Function) => {
      handler({}, null, vi.fn());
    }),
  } as any;
}

function createMockFastifyRequest(options: { method: string; url: string }) {
  const { Readable } = require("node:stream");
  const raw = new Readable({ read() { this.push(null); } });
  raw.method = options.method;
  raw.url = options.url;
  raw.headers = { host: "localhost" };
  raw.socket = { encrypted: false };

  return { raw } as any;
}

function createMockFastifyReply() {
  const chunks: Buffer[] = [];
  const raw = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: any) => chunks.push(Buffer.from(chunk))),
    end: vi.fn(),
  };
  const hijack = vi.fn();

  return { raw, hijack, chunks };
}
