import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ExecuteModule from "../src/utils/execute";

vi.mock("../src/utils/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof ExecuteModule>();
  return {
    ...actual,
    executeRequest: vi.fn(),
  };
});

import { createHandler, requireSources } from "../src/adapter";
import { isConfigurationError } from "../src/errors";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { executeRequest } from "../src/utils/execute";

const mockExecuteRequest = vi.mocked(executeRequest);

/** Seed the global sources registry and create a zero-arg handler. */
function setupHandler(sources: unknown = {}) {
  registerSources(sources as Parameters<typeof registerSources>[0]);
  return createHandler();
}

afterEach(() => {
  vi.clearAllMocks();
  _resetSourcesForTests();
});

describe("requireSources", () => {
  it("throws SOURCES_NOT_REGISTERED when no sources registered", () => {
    _resetSourcesForTests();
    let caught: unknown;
    try {
      requireSources();
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    if (isConfigurationError(caught)) {
      expect(caught.code).toBe("SOURCES_NOT_REGISTERED");
      expect(caught.message).toContain("attachRuntime");
    }
  });

  it("returns the registered sources after registerSources call", () => {
    const sources = { api: {} } as Parameters<typeof registerSources>[0];
    registerSources(sources);
    expect(requireSources()).toBe(sources);
  });
});

describe("createHandler", () => {
  describe("handle", () => {
    it("routes GET requests to handleGet", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handle } = setupHandler({ api: {} });
      const req = new Request("http://localhost/api/request?_s=api&_m=list");

      await handle(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("GET");
    });

    it("routes POST requests to handlePost", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handle } = setupHandler({ api: {} });
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({}),
      });

      await handle(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("POST");
    });

    it("returns 405 for unsupported methods", async () => {
      const { handle } = setupHandler({});
      const req = new Request("http://localhost/api/request", { method: "DELETE" });

      const res = await handle(req);
      expect(res.status).toBe(405);

      const data = await res.json();
      expect(data.message).toContain("Method not allowed");
    });

    it("returns 405 for PUT", async () => {
      const { handle } = setupHandler({});
      const req = new Request("http://localhost/api/request", { method: "PUT" });

      const res = await handle(req);
      expect(res.status).toBe(405);
    });
  });

  describe("handleGet", () => {
    it("returns 400 when _s is missing", async () => {
      const { handleGet } = setupHandler({});
      const req = new Request("http://localhost/api/request?_m=list");

      const res = await handleGet(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("_s");
    });

    it("returns 400 when _m is missing", async () => {
      const { handleGet } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api");

      const res = await handleGet(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.message).toContain("_m");
    });

    it("parses _s, _g, _m from query params", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
      const req = new Request("http://localhost/api/request?_s=api&_g=users&_m=getAll");

      await handleGet(req);

      // `registerSources` stamps a Symbol on each source for name lookup,
      // so equality matchers must tolerate the presence of that symbol key.
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({ api: expect.any(Object) }),
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

    it("reads the variables from _v, keeping their types", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
      const vars = encodeURIComponent(JSON.stringify({ page: 2, tags: ["a", "b"] }));
      const req = new Request(`http://localhost/api/request?_s=api&_m=list&_v=${vars}`);

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.variables).toEqual({ page: 2, tags: ["a", "b"] });
    });

    it("ignores loose query parameters", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
      await handleGet(new Request("http://localhost/api/request?_s=api&_m=list&page=2"));

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.variables).toBeUndefined();
    });

    it("refuses _v that is not a JSON object", async () => {
      const { handleGet } = setupHandler({ api: {} });

      const notJson = await handleGet(
        new Request("http://localhost/api/request?_s=api&_m=list&_v=%7Bx"),
      );
      const list = await handleGet(
        new Request("http://localhost/api/request?_s=api&_m=list&_v=%5B1%5D"),
      );

      expect(notJson.status).toBe(400);
      expect(list.status).toBe(400);
      expect(mockExecuteRequest).not.toHaveBeenCalled();
    });

    it("parses _o as JSON options", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
      const opts = JSON.stringify({ rawData: true });
      const req = new Request(
        `http://localhost/api/request?_s=api&_m=list&_o=${encodeURIComponent(opts)}`,
      );

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options).toEqual({ rawData: true });
    });

    it("refuses invalid _o JSON instead of ignoring it", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
      const req = new Request("http://localhost/api/request?_s=api&_m=list&_o=invalid");

      const response = await handleGet(req);

      expect(response.status).toBe(400);
      expect(mockExecuteRequest).not.toHaveBeenCalled();
    });

    it("sanitizes __proto__ in _o JSON", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
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

      const { handleGet } = setupHandler({ api: {} });
      const req = new Request("http://localhost/api/request?_s=api&_m=health");

      await handleGet(req);

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBeUndefined();
    });

    it("provides context with res to executeRequest", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handleGet } = setupHandler({ api: {} });
      const req = new Request("http://localhost/api/request?_s=api&_m=list");

      await handleGet(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.req).toBeInstanceOf(Request);
      expect(context.res).toBeInstanceOf(Response);
      expect(context.proxyMethod).toBe("GET");
    });
  });

  describe("handlePost", () => {
    it("serves a caller that sends no Origin, which no hostile page can be", async () => {
      const { handlePost } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handlePost(req);

      expect(res.status).not.toBe(403);
    });

    it("returns 403 when origin does not match", async () => {
      const { handlePost } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
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

      const { handlePost } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({}),
      });

      await handlePost(req);
      expect(mockExecuteRequest).toHaveBeenCalled();
    });

    it("returns 415 for unsupported content type", async () => {
      const { handlePost } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
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

      const { handlePost } = setupHandler({ api: {} });
      const payload = { variables: { page: 1 } };
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify(payload),
      });

      await handlePost(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({ api: expect.any(Object) }),
        {
          source: "api",
          group: undefined,
          method: "list",
          variables: { page: 1 },
          options: undefined,
        },
        expect.objectContaining({ proxyMethod: "POST" }),
      );
    });

    it("returns 400 for invalid JSON", async () => {
      const { handlePost } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
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

      const { handlePost } = setupHandler({ api: {} });

      const fd = new FormData();
      fd.append("_options", "{}");
      fd.append("file", new File(["content"], "test.txt"));

      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handlePost(req);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({ api: expect.any(Object) }),
        expect.objectContaining({ source: "api", method: "list", variables: expect.any(FormData) }),
        expect.objectContaining({ proxyMethod: "POST" }),
      );
    });

    it("sets proxyMethod: POST in context", async () => {
      mockExecuteRequest.mockResolvedValue(new Response("{}"));

      const { handlePost } = setupHandler({});
      const req = new Request("http://localhost/api/request?_s=api&_m=list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({}),
      });

      await handlePost(req);

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context.proxyMethod).toBe("POST");
    });
  });
});
