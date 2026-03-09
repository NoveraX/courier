import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { apiRoute } from "../src/next/apiRoute";

vi.mock("../src/utils/createRequest", () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from "../src/utils/createRequest";

const mockExecuteRequest = vi.mocked(executeRequest);

afterEach(() => {
  vi.clearAllMocks();
});

function createRequest(
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
  describe("origin validation", () => {
    it("returns 403 when origin is missing", async () => {
      const { POST } = apiRoute({});
      const req = new NextRequest("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.message).toContain("Origin mismatch");
    });

    it("returns 403 when origin does not match request URL", async () => {
      const { POST } = apiRoute({});
      const req = createRequest(JSON.stringify({}), {
        origin: "http://evil.com",
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("allows request when origin matches", async () => {
      mockExecuteRequest.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

      const { POST } = apiRoute({});
      const req = createRequest(JSON.stringify({ source: "api", method: "list" }));

      const res = await POST(req);
      expect(mockExecuteRequest).toHaveBeenCalled();
    });
  });

  describe("content-type handling", () => {
    it("returns 415 for unsupported content type", async () => {
      const { POST } = apiRoute({});
      const req = createRequest("plain text", { contentType: "text/plain" });

      const res = await POST(req);
      expect(res.status).toBe(415);

      const data = await res.json();
      expect(data.message).toContain("Unsupported Content-Type");
    });

    it("parses JSON body", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { POST } = apiRoute({ api: {} } as any);
      const payload = { source: "api", method: "list", variables: { page: 1 } };
      const req = createRequest(JSON.stringify(payload));

      await POST(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { api: {} },
        payload,
        expect.objectContaining({
          req: expect.any(NextRequest),
        }),
      );
    });

    it("returns 400 for invalid JSON", async () => {
      const { POST } = apiRoute({});
      const req = createRequest("not-valid-json");

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("Invalid JSON");
    });

    it("parses multipart/form-data body", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { POST } = apiRoute({ api: {} } as any);

      const fd = new FormData();
      fd.append("_source", "api");
      fd.append("_method", "upload");
      fd.append("file", new File(["content"], "test.txt"));

      const req = new NextRequest("http://localhost:3000/api/request", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: fd,
      });

      await POST(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { api: {} },
        expect.any(FormData),
        expect.objectContaining({
          req: expect.any(NextRequest),
        }),
      );
    });
  });

  describe("executeRequest integration", () => {
    it("passes sources to executeRequest", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const sources = { users: {}, auth: {} } as any;
      const { POST } = apiRoute(sources);
      const req = createRequest(JSON.stringify({ source: "users", method: "list" }));

      await POST(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        sources,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("provides context with req and res to executeRequest", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { POST } = apiRoute({});
      const req = createRequest(JSON.stringify({ source: "api", method: "list" }));

      await POST(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.req).toBeInstanceOf(NextRequest);
      expect(context.res).toBeDefined();
    });
  });
});
