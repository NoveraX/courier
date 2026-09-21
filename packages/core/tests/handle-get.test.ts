import { afterEach, describe, expect, it, vi } from "vitest";
import { createGetHandler } from "../src/adapter/handle-get";
import type { StudioHooks } from "../src/studio/hooks";

function createMockExecute() {
  return vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
}

function createHooks(): StudioHooks {
  return {
    onProxyReceive: vi.fn(),
    onProxyParse: vi.fn(),
    onProxyRespond: vi.fn(),
  } as unknown as StudioHooks;
}

function getRequest(params: string): Request {
  return new Request(`http://localhost/api/request?${params}`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createGetHandler", () => {
  describe("param validation", () => {
    it("returns 400 when _s is missing", async () => {
      const handler = createGetHandler(createMockExecute(), createHooks());
      const res = await handler(getRequest("_m=list"));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain("_s");
    });

    it("returns 400 when _m is missing", async () => {
      const handler = createGetHandler(createMockExecute(), createHooks());
      const res = await handler(getRequest("_s=api"));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain("_m");
    });

    it("returns 400 when both _s and _m are missing", async () => {
      const handler = createGetHandler(createMockExecute(), createHooks());
      const res = await handler(getRequest("foo=bar"));

      expect(res.status).toBe(400);
    });
  });

  describe("param extraction", () => {
    it("parses _s and _m from query params", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=list"));

      expect(execute).toHaveBeenCalledOnce();
      const payload = execute.mock.calls[0]![1];
      expect(payload.source).toBe("api");
      expect(payload.method).toBe("list");
    });

    it("parses _g as group when present", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_g=users&_m=getAll"));

      const payload = execute.mock.calls[0]![1];
      expect(payload.group).toBe("users");
    });

    it("sets group to undefined when _g is absent", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=health"));

      const payload = execute.mock.calls[0]![1];
      expect(payload.group).toBeUndefined();
    });
  });

  describe("variable forwarding", () => {
    it("collects non-meta params as variables", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=list&page=2&limit=10"));

      const payload = execute.mock.calls[0]![1];
      expect(payload.variables).toEqual({ page: "2", limit: "10" });
    });

    it("excludes all meta keys from variables", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_g=users&_m=list&_o={}&_transport=sse&name=test"));

      const payload = execute.mock.calls[0]![1];
      expect(payload.variables).toEqual({ name: "test" });
    });

    it("sets variables to undefined when only meta keys present", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=list"));

      const payload = execute.mock.calls[0]![1];
      expect(payload.variables).toBeUndefined();
    });
  });

  describe("options parsing", () => {
    it("parses _o as JSON options", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());
      const opts = encodeURIComponent(JSON.stringify({ rawData: true }));

      await handler(getRequest(`_s=api&_m=list&_o=${opts}`));

      const payload = execute.mock.calls[0]![1];
      expect(payload.options).toEqual({ rawData: true });
    });

    it("sets options to undefined when _o is absent", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=list"));

      const payload = execute.mock.calls[0]![1];
      expect(payload.options).toBeUndefined();
    });

    it("refuses invalid _o JSON instead of ignoring it", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      const response = await handler(getRequest("_s=api&_m=list&_o=not-json"));

      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe("execute invocation", () => {
    it("passes original request to execute", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());
      const req = getRequest("_s=api&_m=list");

      await handler(req);

      expect(execute.mock.calls[0]![0]).toBe(req);
    });

    it("passes GET as proxyMethod", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=list"));

      expect(execute.mock.calls[0]![2]).toBe("GET");
    });

    it("passes a numeric proxyReceiveAt timestamp", async () => {
      const execute = createMockExecute();
      const handler = createGetHandler(execute, createHooks());

      await handler(getRequest("_s=api&_m=list"));

      const proxyReceiveAt = execute.mock.calls[0]![3];
      expect(typeof proxyReceiveAt).toBe("number");
      expect(proxyReceiveAt).toBeGreaterThan(0);
    });

    it("returns the response from execute", async () => {
      const expected = new Response("custom", { status: 201 });
      const execute = vi.fn().mockResolvedValue(expected);
      const handler = createGetHandler(execute, createHooks());

      const res = await handler(getRequest("_s=api&_m=list"));

      expect(res).toBe(expected);
    });
  });

  describe("studio hooks", () => {
    it("calls onProxyReceive with correct payload", async () => {
      const hooks = createHooks();
      const handler = createGetHandler(createMockExecute(), hooks);

      await handler(getRequest("_s=api&_g=users&_m=getAll"));

      expect(hooks.onProxyReceive).toHaveBeenCalledOnce();
      expect(hooks.onProxyReceive).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyMethod: "GET",
          source: "api",
          group: "users",
          method: "getAll",
        }),
      );
    });

    it("calls onProxyParse with variables", async () => {
      const hooks = createHooks();
      const handler = createGetHandler(createMockExecute(), hooks);

      await handler(getRequest("_s=api&_m=list&page=1"));

      expect(hooks.onProxyParse).toHaveBeenCalledOnce();
      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "api",
          method: "list",
          variables: { page: "1" },
        }),
      );
    });

    it("calls onProxyParse with undefined variables when none present", async () => {
      const hooks = createHooks();
      const handler = createGetHandler(createMockExecute(), hooks);

      await handler(getRequest("_s=api&_m=list"));

      expect(hooks.onProxyParse).toHaveBeenCalledWith(
        expect.objectContaining({ variables: undefined }),
      );
    });

    it("calls onProxyRespond with response status", async () => {
      const hooks = createHooks();
      const execute = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
      const handler = createGetHandler(execute, hooks);

      await handler(getRequest("_s=api&_m=missing"));

      expect(hooks.onProxyRespond).toHaveBeenCalledOnce();
      expect(hooks.onProxyRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyMethod: "GET",
          source: "api",
          method: "missing",
          status: 404,
        }),
      );
    });

    it("does not throw when hooks are undefined", async () => {
      const handler = createGetHandler(createMockExecute(), {} as StudioHooks);

      const res = await handler(getRequest("_s=api&_m=list"));

      expect(res.status).toBe(200);
    });
  });
});
