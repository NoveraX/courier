import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostHandler } from "../src/adapter/handle-post";
import type { StudioHooks } from "../src/studio/hooks";

/** The URL of a proxy call to `api.users.list`, as the client writes it. */
const CALL_URL = "http://localhost/api/request?_s=api&_g=users&_m=list";

function createMockExecute() {
  return vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
}

function createHooks() {
  return {
    onProxyReceive: vi.fn(),
    onProxyParse: vi.fn(),
    onProxyRespond: vi.fn(),
    onProxyOriginReject: vi.fn(),
    onRequestStart: vi.fn(),
    onRequestError: vi.fn(),
  } satisfies StudioHooks;
}

function postRequest(
  body: string | FormData,
  headers: Record<string, string> = {},
  url = CALL_URL,
): Request {
  const defaultHeaders: Record<string, string> = { origin: "http://localhost", ...headers };
  if (typeof body === "string" && !defaultHeaders["content-type"]) {
    defaultHeaders["content-type"] = "application/json";
  }
  return new Request(url, { method: "POST", headers: defaultHeaders, body });
}

function upload(fields: Array<[string, string | Blob]>): Request {
  const fd = new FormData();
  for (const [key, value] of fields) fd.append(key, value);
  return postRequest(fd);
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
      const req = new Request(CALL_URL, {
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

      const res = await handler(postRequest("{}", { origin: "http://evil.com" }));

      expect(res.status).toBe(403);
    });

    it("emits onProxyOriginReject with mismatched origin, and nothing about the call", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);

      await handler(postRequest("{}", { origin: "http://evil.com" }));

      expect(hooks.onProxyOriginReject).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "http://evil.com" }),
      );
      expect(hooks.onProxyReceive).not.toHaveBeenCalled();
      expect(hooks.onRequestStart).not.toHaveBeenCalled();
    });
  });

  describe("the endpoint, named in the URL", () => {
    it("is read from _s, _g and _m", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      await handler(postRequest(JSON.stringify({ variables: { page: 1 } })));

      expect(execute.mock.calls[0]![1]).toEqual({
        source: "api",
        group: "users",
        method: "list",
        variables: { page: 1 },
        options: undefined,
      });
    });

    it("has no group when _g is absent", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      await handler(postRequest("{}", {}, "http://localhost/api/request?_s=api&_m=ping"));

      expect(execute.mock.calls[0]![1]).toMatchObject({ source: "api", group: undefined, method: "ping" });
    });

    it("is required: a POST that does not name it is refused before its body is read", async () => {
      const execute = createMockExecute();
      const hooks = createHooks();
      const handler = createPostHandler(execute, hooks);

      const res = await handler(
        postRequest(JSON.stringify({ variables: {} }), {}, "http://localhost/api/request?_s=api"),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe("Missing required params: _s, _m");
      expect(execute).not.toHaveBeenCalled();
      expect(hooks.onRequestStart).not.toHaveBeenCalled();
    });

    it("is not taken from a body that names it", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(
        postRequest(
          JSON.stringify({ source: "api", method: "list", variables: {} }),
          {},
          "http://localhost/api/request",
        ),
      );

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe("content-type validation", () => {
    it.each(["text/plain", "application/xml"])("returns 415 for %s", async (type) => {
      const handler = createPostHandler(createMockExecute(), createHooks());

      const res = await handler(postRequest("data", { "content-type": type }));

      expect(res.status).toBe(415);
      expect((await res.json()).message).toContain("Unsupported Content-Type");
    });

    it("returns 415 when content-type is missing", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());
      const req = new Request(CALL_URL, {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: "data",
      });

      const res = await handler(req);

      expect(res.status).toBe(415);
    });

    it.each(["application/json", "application/json; charset=utf-8"])(
      "accepts %s",
      async (type) => {
        const execute = createMockExecute();
        const handler = createPostHandler(execute, createHooks());

        const res = await handler(postRequest("{}", { "content-type": type }));

        expect(res.status).toBe(200);
        expect(execute).toHaveBeenCalledOnce();
      },
    );

    it("accepts multipart/form-data", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(upload([["note", "hi"]]));

      expect(res.status).toBe(200);
      expect(execute).toHaveBeenCalledOnce();
    });
  });

  describe("JSON envelope", () => {
    it("returns 400 for invalid JSON", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());

      const res = await handler(postRequest("not-valid-json"));

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain("Invalid JSON");
    });

    it("returns 400 for truncated JSON", async () => {
      const handler = createPostHandler(createMockExecute(), createHooks());

      const res = await handler(postRequest('{"variables": {'));

      expect(res.status).toBe(400);
    });

    it.each([["[1, 2]"], ['"text"'], ["null"]])("refuses %s, which is not an envelope", async (body) => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(postRequest(body));

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });

    it("refuses a field beside variables and options, naming where the endpoint goes", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(postRequest(JSON.stringify({ variables: {}, method: "purge" })));

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain("_s, _g, _m");
      expect(execute).not.toHaveBeenCalled();
    });

    it("refuses an option a proxy client may not set", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(postRequest(JSON.stringify({ options: { prefixUrl: "http://x" } })));

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain("prefixUrl");
      expect(execute).not.toHaveBeenCalled();
    });

    it("passes the variables and the accepted options to execute", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      await handler(postRequest(JSON.stringify({ variables: [1, 2], options: { rawData: true } })));

      expect(execute.mock.calls[0]![1]).toMatchObject({ variables: [1, 2], options: { rawData: true } });
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
          controller.enqueue(new TextEncoder().encode('{"variables":'));
        },
      });
      const req = new Request(CALL_URL, {
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

    it("warns about a body that failed while its client stayed", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = createPostHandler(createMockExecute(), createHooks());
      const overLimit = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("request body size exceeded BODY_SIZE_LIMIT of 524288"));
        },
      });
      const req = new Request(CALL_URL, {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: overLimit,
        // @ts-expect-error -- required by the platform for a streaming body
        duplex: "half",
      });

      const res = await handler(req);

      expect(res.status).toBe(400);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.map(String).join(" ")).toContain("BODY_SIZE_LIMIT");
      expect(error).not.toHaveBeenCalled();
    });

    /** The GET path strips these from `_v`; the POST path kept them. */
    it("drops keys that reach Object.prototype, as the GET path does", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest(
        '{"variables":{"__proto__":{"polluted":1},"constructor":{"prototype":{"p":1}},"nested":{"prototype":1,"kept":2},"ok":1}}',
      );

      await handler(req);

      expect(execute).toHaveBeenCalledOnce();
      const { variables } = execute.mock.calls[0]![1] as { variables: Record<string, unknown> };
      expect(Object.keys(variables)).toEqual(["nested", "ok"]);
      expect(variables.nested).toEqual({ kept: 2 });
      expect(JSON.stringify(variables)).not.toContain("polluted");
    });
  });

  describe("multipart envelope", () => {
    it("passes the caller's form, without the options field, as the variables", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      await handler(
        upload([
          ["_options", '{"timeout":1000}'],
          ["file", new File(["content"], "test.txt")],
        ]),
      );

      const { variables, options } = execute.mock.calls[0]![1] as { variables: FormData; options: unknown };
      expect(variables).toBeInstanceOf(FormData);
      expect([...variables.keys()]).toEqual(["file"]);
      expect(options).toEqual({ timeout: 1000 });
    });

    /** A Laravel or Rails form carries `_method=PUT`, and the upstream reads it. */
    it("keeps a caller's own fields whatever their names, and a later _options field", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      await handler(
        upload([
          ["_options", "{}"],
          ["_method", "PUT"],
          ["_source", "other"],
          ["_options", "not options"],
        ]),
      );

      const { variables, method, source } = execute.mock.calls[0]![1] as {
        variables: FormData;
        method: string;
        source: string;
      };
      expect([...variables.entries()]).toEqual([
        ["_method", "PUT"],
        ["_source", "other"],
        ["_options", "not options"],
      ]);
      expect({ source, method }).toEqual({ source: "api", method: "list" });
    });

    /**
     * The JSON envelope and the GET `_o` parameter refuse an option a proxy
     * client may not set; the multipart field is held to the same rule.
     */
    it.each([
      ["an option only the server may set", '{"prefixUrl":"http://127.0.0.1:7379"}', "prefixUrl"],
      ["an invalid timeout", '{"timeout":-5}', "timeout"],
      ["text that is not JSON", "{not json", "not valid JSON"],
      ["a value that is not an object", "[1]", "must be an object"],
    ])("refuses %s with 400", async (_, options, reason) => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(upload([["_options", options], ["file", new File(["x"], "a.txt")]]));

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain(reason);
      expect(execute).not.toHaveBeenCalled();
    });

    it("refuses options sent as a file", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());

      const res = await handler(upload([["_options", new Blob(['{"rawData":true}'])]]));

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe("execute invocation", () => {
    it("passes the original request, POST, and a numeric receive time", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, createHooks());
      const req = postRequest("{}");

      await handler(req);

      const [request, , proxyMethod, proxyReceiveAt] = execute.mock.calls[0]!;
      expect(request).toBe(req);
      expect(proxyMethod).toBe("POST");
      expect(typeof proxyReceiveAt).toBe("number");
    });

    it("returns the response from execute", async () => {
      const expected = new Response("custom", { status: 201 });
      const handler = createPostHandler(vi.fn().mockResolvedValue(expected), createHooks());

      const res = await handler(postRequest("{}"));

      expect(res).toBe(expected);
    });
  });

  describe("studio hooks", () => {
    it("announces the call before its body is read, and runs it under the same id", async () => {
      const hooks = createHooks();
      const execute = createMockExecute();
      const handler = createPostHandler(execute, hooks);

      await handler(postRequest(JSON.stringify({ variables: { page: 1 } })));

      const started = hooks.onRequestStart.mock.calls[0]![0];
      expect(started).toMatchObject({ source: "api", group: "users", method: "list", mode: "proxy" });
      expect(execute.mock.calls[0]![4]).toBe(started.id);
      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({ proxyMethod: "POST", requestId: started.id }),
      );
      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { page: 1 }, requestId: started.id }),
      );
    });

    it("ends a call refused while it is read with request:error and its status", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks, { maxBodyBytes: 8 });

      const res = await handler(postRequest(JSON.stringify({ variables: { big: "x".repeat(64) } })));

      const { id } = hooks.onRequestStart.mock.calls[0]![0];
      expect(res.status).toBe(413);
      expect(hooks.onRequestError).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          error: { type: "http", status: 413, message: "Request body exceeds 8 bytes" },
        }),
      );
      expect(hooks.onProxyRespond).toHaveBeenCalledWith(
        expect.objectContaining({ status: 413, requestId: id }),
      );
    });

    it("describes an upload's variables as JSON can carry them", async () => {
      const hooks = createHooks();
      const handler = createPostHandler(createMockExecute(), hooks);

      await handler(upload([["_options", "{}"], ["note", "hello"]]));

      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { note: "hello" } }),
      );
    });

    it("calls onProxyRespond with the response status", async () => {
      const hooks = createHooks();
      const execute = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
      const handler = createPostHandler(execute, hooks);

      await handler(postRequest("{}"));

      expect(hooks.onProxyRespond).toHaveBeenCalledOnce();
      expect(hooks.onProxyRespond).toHaveBeenCalledWith(
        expect.objectContaining({ proxyMethod: "POST", source: "api", method: "list", status: 500 }),
      );
    });

    it("gives the call no id while no request lifecycle is traced", async () => {
      const execute = createMockExecute();
      const handler = createPostHandler(execute, {});

      const res = await handler(postRequest("{}"));

      expect(res.status).toBe(200);
      expect(execute.mock.calls[0]![4]).toBeUndefined();
    });
  });
});
