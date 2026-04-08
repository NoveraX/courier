import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ExecuteModule from "../src/utils/execute";

vi.mock("../src/utils/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof ExecuteModule>();
  return {
    ...actual,
    executeRequest: vi.fn(),
  };
});

import { executeRequest } from "../src/utils/execute";
import { createHandler } from "../src/adapter";

const mockExecuteRequest = vi.mocked(executeRequest);

afterEach(() => {
  vi.clearAllMocks();
});

describe("createHandler", () => {
  describe("handle", () => {
    it("routes GET requests to handleGet", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handle } = createHandler({ api: {} } as any);
      const req = new Request("http://localhost/api/request?_s=api&_m=list");

      await handle(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("GET");
    });

    it("routes POST requests to handlePost", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handle } = createHandler({ api: {} } as any);
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ source: "api", method: "list" }),
      });

      await handle(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("POST");
    });

    it("returns 405 for unsupported methods", async () => {
      const { handle } = createHandler({});
      const req = new Request("http://localhost/api/request", { method: "DELETE" });

      const res = await handle(req);
      expect(res.status).toBe(405);

      const data = await res.json();
      expect(data.message).toContain("Method not allowed");
    });

    it("returns 405 for PUT", async () => {
      const { handle } = createHandler({});
      const req = new Request("http://localhost/api/request", { method: "PUT" });

      const res = await handle(req);
      expect(res.status).toBe(405);
    });
  });

  describe("handleGet", () => {
    it("returns 400 when _s is missing", async () => {
      const { handleGet } = createHandler({});
      const req = new Request("http://localhost/api/request?_m=list");

      const res = await handleGet(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("_s");
    });

    it("returns 400 when _m is missing", async () => {
      const { handleGet } = createHandler({});
      const req = new Request("http://localhost/api/request?_s=api");

      const res = await handleGet(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("_m");
    });

    it("parses _s, _g, _m from query params", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const req = new Request(
        "http://localhost/api/request?_s=api&_g=users&_m=getAll",
      );

      await handleGet(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { api: {} },
        {
          source: "api",
          group: "users",
          method: "getAll",
          variables: undefined,
          options: undefined,
        },
        expect.objectContaining({ proxyMethod: "GET" }),
      );
    });

    it("collects non-meta params as variables", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const req = new Request(
        "http://localhost/api/request?_s=api&_m=list&page=2&limit=10",
      );

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.variables).toEqual({ page: "2", limit: "10" });
    });

    it("parses _o as JSON options", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const opts = JSON.stringify({ rawData: true });
      const req = new Request(
        `http://localhost/api/request?_s=api&_m=list&_o=${encodeURIComponent(opts)}`,
      );

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toEqual({ rawData: true });
    });

    it("ignores invalid _o JSON", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const req = new Request(
        "http://localhost/api/request?_s=api&_m=list&_o=invalid",
      );

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toBeUndefined();
    });

    it("sanitizes __proto__ in _o JSON", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const opts = JSON.stringify({ __proto__: { polluted: true }, rawData: true });
      const req = new Request(
        `http://localhost/api/request?_s=api&_m=list&_o=${encodeURIComponent(opts)}`,
      );

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toEqual({ rawData: true });
    });

    it("handles group-less endpoints", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const req = new Request("http://localhost/api/request?_s=api&_m=health");

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBeUndefined();
    });

    it("provides context with res to executeRequest", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = createHandler({ api: {} } as any);
      const req = new Request("http://localhost/api/request?_s=api&_m=list");

      await handleGet(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.req).toBeInstanceOf(Request);
      expect(context.res).toBeInstanceOf(Response);
      expect(context.proxyMethod).toBe("GET");
    });
  });

  describe("handlePost", () => {
    it("returns 403 when origin is missing", async () => {
      const { handlePost } = createHandler({});
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handlePost(req);
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.message).toContain("Origin mismatch");
    });

    it("returns 403 when origin does not match", async () => {
      const { handlePost } = createHandler({});
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.com",
        },
        body: JSON.stringify({}),
      });

      const res = await handlePost(req);
      expect(res.status).toBe(403);
    });

    it("allows request when origin matches", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handlePost } = createHandler({});
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ source: "api", method: "list" }),
      });

      await handlePost(req);
      expect(mockExecuteRequest).toHaveBeenCalled();
    });

    it("returns 415 for unsupported content type", async () => {
      const { handlePost } = createHandler({});
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost",
        },
        body: "plain text",
      });

      const res = await handlePost(req);
      expect(res.status).toBe(415);

      const data = await res.json();
      expect(data.message).toContain("Unsupported Content-Type");
    });

    it("parses JSON body", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handlePost } = createHandler({ api: {} } as any);
      const payload = { source: "api", method: "list", variables: { page: 1 } };
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify(payload),
      });

      await handlePost(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { api: {} },
        payload,
        expect.objectContaining({ proxyMethod: "POST" }),
      );
    });

    it("returns 400 for invalid JSON", async () => {
      const { handlePost } = createHandler({});
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: "not-valid-json",
      });

      const res = await handlePost(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("Invalid JSON");
    });

    it("parses multipart/form-data body", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handlePost } = createHandler({ api: {} } as any);

      const fd = new FormData();
      fd.append("_source", "api");
      fd.append("_method", "upload");
      fd.append("file", new File(["content"], "test.txt"));

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handlePost(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { api: {} },
        expect.any(FormData),
        expect.objectContaining({ proxyMethod: "POST" }),
      );
    });

    it("sets proxyMethod: POST in context", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handlePost } = createHandler({});
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ source: "api", method: "list" }),
      });

      await handlePost(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("POST");
    });
  });
});
