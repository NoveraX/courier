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

      await POST(req);
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

    it("POST handler sets proxyMethod: POST in context", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { POST } = apiRoute({});
      const req = createRequest(JSON.stringify({ source: "api", method: "list" }));

      await POST(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("POST");
    });
  });

  describe("GET handler", () => {
    it("exports GET handler", () => {
      const route = apiRoute({});
      expect(route.GET).toBeDefined();
      expect(typeof route.GET).toBe("function");
    });

    it("returns 400 when _s param is missing", async () => {
      const { GET } = apiRoute({});
      const req = new NextRequest("http://localhost:3000/api/request?_m=getAll");

      const res = await GET(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("_s");
    });

    it("returns 400 when _m param is missing", async () => {
      const { GET } = apiRoute({});
      const req = new NextRequest("http://localhost:3000/api/request?_s=api");

      const res = await GET(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("_m");
    });

    it("parses _s, _g, _m from query params", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest(
        "http://localhost:3000/api/request?_s=api&_g=users&_m=getAll",
      );

      await GET(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { api: {} },
        { source: "api", group: "users", method: "getAll", variables: undefined, options: undefined },
        expect.objectContaining({ proxyMethod: "GET" }),
      );
    });

    it("collects non-meta params as variables", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest(
        "http://localhost:3000/api/request?_s=api&_m=list&page=2&limit=10",
      );

      await GET(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.variables).toEqual({ page: "2", limit: "10" });
    });

    it("parses _o as JSON options", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const opts = JSON.stringify({ rawData: true });
      const req = new NextRequest(
        `http://localhost:3000/api/request?_s=api&_m=list&_o=${encodeURIComponent(opts)}`,
      );

      await GET(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toEqual({ rawData: true });
    });

    it("ignores invalid _o JSON", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest(
        "http://localhost:3000/api/request?_s=api&_m=list&_o=invalid",
      );

      await GET(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toBeUndefined();
    });

    it("does not require origin header (no CSRF check for GET)", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest(
        "http://localhost:3000/api/request?_s=api&_m=list",
      );

      await GET(req);
      expect(mockExecuteRequest).toHaveBeenCalled();
    });

    it("handles group-less endpoints", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const req = new NextRequest(
        "http://localhost:3000/api/request?_s=api&_m=health",
      );

      await GET(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBeUndefined();
    });

    it("sanitizes __proto__ in _o JSON", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { GET } = apiRoute({ api: {} } as any);
      const opts = JSON.stringify({ __proto__: { polluted: true }, rawData: true });
      const req = new NextRequest(
        `http://localhost:3000/api/request?_s=api&_m=list&_o=${encodeURIComponent(opts)}`,
      );

      await GET(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toEqual({ rawData: true });
    });
  });
});
