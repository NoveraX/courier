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
  vi.unstubAllEnvs();
});

describe("createPostHandler", () => {
  describe("origin check", () => {
    it("serves a caller that sends no Origin, which no hostile page can be", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handler(req);

      expect(res.status).not.toBe(403);
      expect(execute).toHaveBeenCalledOnce();
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

    it("does not report a rejection for a caller that sends no Origin", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      await handler(req);

      expect(hooks.onProxyOriginReject).not.toHaveBeenCalled();
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

    /**
     * A client that leaves mid-upload is not a server failure. The read's
     * rejection escaped the handler, and every framework's error handler
     * logged it with a stack.
     */
    it("answers a body the client stopped sending, without throwing", async () => {
      vi.stubEnv("COURIER_LOG_LEVEL", "debug");
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      let sent = false;
      const leaving = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent) return controller.error(Object.assign(new Error("aborted"), { code: "ECONNRESET" }));
          sent = true;
          controller.enqueue(new TextEncoder().encode('{"source":'));
        },
      });
      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: leaving,
        // @ts-expect-error -- required by the platform for a streaming body
        duplex: "half",
      });

      const res = await handler(req);

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledOnce();
    });

    /** The GET path strips these from `_v`; the POST path kept them. */
    it("drops keys that reach Object.prototype, as the GET path does", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        '{"source":"api","method":"echo","variables":{"__proto__":{"polluted":1},"constructor":{"prototype":{"p":1}},"nested":{"prototype":1,"kept":2},"ok":1}}',
      );

      await handler(req);

      expect(execute).toHaveBeenCalledOnce();
      const { variables } = execute.mock.calls[0]![1] as { variables: Record<string, unknown> };
      expect(Object.keys(variables)).toEqual(["nested", "ok"]);
      expect(variables.nested).toEqual({ kept: 2 });
      expect(JSON.stringify(variables)).not.toContain("polluted");
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

    /**
     * The JSON envelope and the GET `_o` parameter refuse an option a proxy
     * client may not set; the multipart field dropped it and ran the call.
     */
    describe("_options field", () => {
      function upload(options: string | Blob): Request {
        const fd = new FormData();
        fd.append("file", new File(["content"], "test.txt"));
        fd.append("_source", "api");
        fd.append("_method", "upload");
        fd.append("_options", options);
        return new Request("http://localhost/api/request", {
          method: "POST",
          headers: { origin: "http://localhost" },
          body: fd,
        });
      }

      it.each([
        ["an option only the server may set", '{"prefixUrl":"http://127.0.0.1:7379"}', "prefixUrl"],
        ["an invalid timeout", '{"timeout":-5}', "timeout"],
        ["text that is not JSON", "{not json", "not valid JSON"],
        ["a value that is not an object", "[1]", "must be an object"],
      ])("refuses %s with 400", async (_, options, reason) => {
        const execute = createMockExecute();
        const handler = createPostHandler(execute, createHooks());

        const res = await handler(upload(options));

        expect(res.status).toBe(400);
        expect((await res.json()).message).toContain(reason);
        expect(execute).not.toHaveBeenCalled();
      });

      it("refuses options sent as a file", async () => {
        const execute = createMockExecute();
        const handler = createPostHandler(execute, createHooks());

        const res = await handler(upload(new Blob(['{"rawData":true}'])));

        expect(res.status).toBe(400);
        expect(execute).not.toHaveBeenCalled();
      });

      it("serves the options a proxy client may set", async () => {
        const execute = createMockExecute();
        const handler = createPostHandler(execute, createHooks());

        const res = await handler(upload('{"rawData":true,"timeout":1000}'));

        expect(res.status).toBe(200);
        expect(execute).toHaveBeenCalledOnce();
      });
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

    it("describes FormData variables without the proxy's routing fields", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);

      const fd = new FormData();
      fd.append("note", "hello");
      fd.append("_source", "api");
      fd.append("_method", "upload");

      const req = new Request("http://localhost/api/request", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: fd,
      });

      await handler(req);

      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { note: "hello" } }),
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
