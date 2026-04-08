import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostHandler } from "../src/adapter/handle-post";
import type { StudioHooks } from "../src/studio/hooks";

function createMockExecute() {
  return vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
}

function createHooks(): StudioHooks {
  return {
    onProxyReceive: vi.fn(),
    onProxyParse: vi.fn(),
    onProxyRespond: vi.fn(),
    onProxyOriginReject: vi.fn(),
  } as unknown as StudioHooks;
}

function postRequest(
  body: string | FormData,
  headers: Record<string, string> = {},
): Request {
  const defaultHeaders: Record<string, string> = {
    origin: "http://localhost",
    ...headers,
  };

  // Only set content-type for string bodies if not already set
  if (typeof body === "string" && !defaultHeaders["content-type"]) {
    defaultHeaders["content-type"] = "application/json";
  }

  return new Request("http://localhost/api/request", {
    method: "POST",
    headers: defaultHeaders,
    body,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPostHandler", () => {
  describe("origin check", () => {
    it("returns 403 when origin header is missing", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handler(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain("Origin mismatch");
    });

    it("returns 403 when origin does not match request URL", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = postRequest(JSON.stringify({}), {
        "content-type": "application/json",
        origin: "http://evil.com",
      });

      const res = await handler(req);

      expect(res.status).toBe(403);
    });

    it("emits onProxyOriginReject when origin is missing", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      await handler(req);

      expect(hooks.onProxyOriginReject).toHaveBeenCalledOnce();
      expect(hooks.onProxyOriginReject).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "" }),
      );
    });

    it("emits onProxyOriginReject with mismatched origin", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(JSON.stringify({}), {
        "content-type": "application/json",
        origin: "http://evil.com",
      });

      await handler(req);

      expect(hooks.onProxyOriginReject).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "http://evil.com" }),
      );
    });

    it("allows request when origin matches", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(execute).toHaveBeenCalledOnce();
    });
  });

  describe("content-type validation", () => {
    it("returns 415 for text/plain", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = postRequest("plain text", { "content-type": "text/plain" });

      const res = await handler(req);

      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.message).toContain("Unsupported Content-Type");
    });

    it("returns 415 for application/xml", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = postRequest("<xml/>", { "content-type": "application/xml" });

      const res = await handler(req);

      expect(res.status).toBe(415);
    });

    it("returns 415 when content-type is missing", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: "data",
      });

      const res = await handler(req);

      expect(res.status).toBe(415);
    });

    it("accepts application/json", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(execute).toHaveBeenCalledOnce();
    });

    it("accepts application/json with charset parameter", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json; charset=utf-8" },
      );

      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(execute).toHaveBeenCalledOnce();
    });

    it("accepts multipart/form-data", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const fd = new FormData();
      fd.append("_source", "api");
      fd.append("_method", "upload");

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(execute).toHaveBeenCalledOnce();
    });
  });

  describe("JSON body parsing", () => {
    it("returns 400 for invalid JSON", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = postRequest("not-valid-json", {
        "content-type": "application/json",
      });

      const res = await handler(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain("Invalid JSON");
    });

    it("returns 400 for truncated JSON", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = postRequest('{"source": "api",', {
        "content-type": "application/json",
      });

      const res = await handler(req);

      expect(res.status).toBe(400);
    });

    it("passes parsed JSON body to execute", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const payload = { source: "api", method: "list", variables: { page: 1 } };
      const req = postRequest(JSON.stringify(payload), {
        "content-type": "application/json",
      });

      await handler(req);

      const receivedPayload = execute.mock.calls[0]![1];
      expect(receivedPayload).toEqual(payload);
    });
  });

  describe("FormData body parsing", () => {
    it("passes FormData to execute", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const fd = new FormData();
      fd.append("_source", "api");
      fd.append("_method", "upload");
      fd.append("file", new File(["content"], "test.txt"));

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handler(req);

      expect(execute.mock.calls[0]![1]).toBeInstanceOf(FormData);
    });

    it("extracts source from _source field in FormData", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);

      const fd = new FormData();
      fd.append("_source", "myApi");
      fd.append("_method", "upload");

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ source: "myApi" }),
      );
    });

    it("extracts group from _group field in FormData", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);

      const fd = new FormData();
      fd.append("_source", "api");
      fd.append("_group", "files");
      fd.append("_method", "upload");

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ group: "files" }),
      );
    });

    it("sets variables to undefined for FormData", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);

      const fd = new FormData();
      fd.append("_source", "api");
      fd.append("_method", "upload");

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handler(req);

      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({ variables: undefined }),
      );
    });
  });

  describe("field extraction from JSON", () => {
    it("extracts source from JSON body", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "myApi", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ source: "myApi", method: "list" }),
      );
    });

    it("extracts group from JSON body", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "api", group: "users", method: "getAll" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ group: "users" }),
      );
    });

    it("uses unknown as fallback when source is missing", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ source: "unknown" }),
      );
    });

    it("uses unknown as fallback when method is missing", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "api" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ method: "unknown" }),
      );
    });

    it("sets group to undefined when absent from JSON", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ group: undefined }),
      );
    });

    it("extracts variables from JSON body for hooks", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list", variables: { page: 1 } }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { page: 1 } }),
      );
    });
  });

  describe("execute invocation", () => {
    it("passes original request to execute", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(execute.mock.calls[0]![0]).toBe(req);
    });

    it("passes POST as proxyMethod", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(execute.mock.calls[0]![2]).toBe("POST");
    });

    it("passes a numeric proxyReceiveAt timestamp", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      const proxyReceiveAt = execute.mock.calls[0]![3];
      expect(typeof proxyReceiveAt).toBe("number");
      expect(proxyReceiveAt).toBeGreaterThan(0);
    });

    it("returns the response from execute", async () => {
      const expected = new Response("custom", { status: 201 });
      const execute = vi.fn().mockResolvedValue(expected);
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      const res = await handler(req);

      expect(res).toBe(expected);
    });
  });

  describe("studio hooks", () => {
    it("calls onProxyReceive with proxyMethod POST", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyReceive).toHaveBeenCalledOnce();
      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ proxyMethod: "POST" }),
      );
    });

    it("calls onProxyParse after body parsing", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest(
        JSON.stringify({ source: "api", group: "users", method: "getAll" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyParse).toHaveBeenCalledOnce();
      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "api",
          group: "users",
          method: "getAll",
        }),
      );
    });

    it("calls onProxyRespond with response status", async () => {
      const hooks = createHooks();
      const execute = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
      const handler = createPostHandler(execute, hooks);
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      await handler(req);

      expect(hooks.onProxyRespond).toHaveBeenCalledOnce();
      expect(hooks.onProxyRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyMethod: "POST",
          source: "api",
          method: "list",
          status: 500,
        }),
      );
    });

    it("does not throw when hooks are undefined", async () => {
      const handler = createPostHandler(createMockExecute(), {} as StudioHooks);
      const req = postRequest(
        JSON.stringify({ source: "api", method: "list" }),
        { "content-type": "application/json" },
      );

      const res = await handler(req);

      expect(res.status).toBe(200);
    });

    it("does not call onProxyReceive on origin rejection", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.com",
        },
        body: JSON.stringify({}),
      });

      await handler(req);

      expect(hooks.onProxyReceive).not.toHaveBeenCalled();
    });

    it("does not call onProxyReceive on content-type rejection", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = postRequest("plain", { "content-type": "text/plain" });

      await handler(req);

      expect(hooks.onProxyReceive).not.toHaveBeenCalled();
    });
  });
});
