import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockHandleGet = vi.fn();
const mockHandlePost = vi.fn();

vi.mock("@noverax/nexus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@noverax/nexus")>();
  return {
    ...actual,
    createHandler: vi.fn(() => ({
      handle: vi.fn(),
      handleGet: mockHandleGet,
      handlePost: mockHandlePost,
    })),
  };
});

import { createHandler } from "@noverax/nexus";
import { apiRoute } from "../src/api-route";

const mockCreateHandler = vi.mocked(createHandler);

afterEach(() => {
  vi.clearAllMocks();
});

function createPostRequest(
  body: string | FormData,
  options: { contentType?: string; origin?: string; url?: string } = {},
) {
  const {
    contentType = "application/json",
    origin = "http://localhost:3000",
    url = "http://localhost:3000/api/request",
  } = options;

  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  if (origin) headers.origin = origin;

  return new NextRequest(url, {
    method: "POST",
    headers,
    body,
  });
}

describe("apiRoute", () => {
  describe("structure", () => {
    it("returns { GET, POST } handlers", () => {
      const route = apiRoute({});
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
      expect(typeof route.GET).toBe("function");
      expect(typeof route.POST).toBe("function");
    });

    it("calls createHandler with sources", () => {
      const sources = { users: {}, auth: {} } as any;
      apiRoute(sources);
      expect(mockCreateHandler).toHaveBeenCalledWith(sources);
    });
  });

  describe("GET handler", () => {
    it("delegates to handleGet with the NextRequest", async () => {
      mockHandleGet.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest(
        "http://localhost:3000/api/request?_s=api&_g=users&_m=getAll",
      );

      await GET(req);

      expect(mockHandleGet).toHaveBeenCalledWith(req);
    });

    it("returns the Response from handleGet", async () => {
      const expectedResponse = new Response(JSON.stringify({ data: "test" }));
      mockHandleGet.mockResolvedValue(expectedResponse);

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest("http://localhost:3000/api/request?_s=api&_m=list");

      const result = await GET(req);
      expect(result).toBe(expectedResponse);
    });

    it("returns 400 when params missing (via createHandler)", async () => {
      mockHandleGet.mockResolvedValue(
        Response.json({ success: false, message: "Missing required params: _s, _m" }, { status: 400 }),
      );

      const { GET } = apiRoute({});
      const req = new NextRequest("http://localhost:3000/api/request?_m=getAll");

      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST handler", () => {
    it("delegates to handlePost with the NextRequest", async () => {
      mockHandlePost.mockResolvedValue(new Response("{}"));

      const { POST } = apiRoute({ api: {} } as any);
      const req = createPostRequest(JSON.stringify({ source: "api", method: "list" }));

      await POST(req);

      expect(mockHandlePost).toHaveBeenCalledWith(req);
    });

    it("returns the Response from handlePost", async () => {
      const expectedResponse = new Response(JSON.stringify({ ok: true }));
      mockHandlePost.mockResolvedValue(expectedResponse);

      const { POST } = apiRoute({});
      const req = createPostRequest(JSON.stringify({ source: "api", method: "list" }));

      const result = await POST(req);
      expect(result).toBe(expectedResponse);
    });

    it("returns 403 for origin mismatch (via createHandler)", async () => {
      mockHandlePost.mockResolvedValue(
        Response.json({ success: false, message: "Origin mismatch" }, { status: 403 }),
      );

      const { POST } = apiRoute({});
      const req = createPostRequest(JSON.stringify({}), { origin: "http://evil.com" });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("passes NextRequest which extends Request", async () => {
      mockHandlePost.mockResolvedValue(new Response("{}"));

      const { POST } = apiRoute({});
      const req = createPostRequest(JSON.stringify({ source: "api", method: "list" }));

      await POST(req);

      const passedReq = mockHandlePost.mock.calls[0]?.[0];
      expect(passedReq).toBeInstanceOf(NextRequest);
      expect(passedReq).toBeInstanceOf(Request);
    });
  });
});
