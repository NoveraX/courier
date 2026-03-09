import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProxyRequest } from "../src/proxy";
import { HTTPError } from "../src/error";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse({}));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createProxyRequest", () => {
  it("returns a curried function", () => {
    const client = createProxyRequest() as any;
    expect(typeof client).toBe("function");
    const execute = client("api");
    expect(typeof execute).toBe("function");
  });

  describe("JSON payload", () => {
    it("sends correct JSON payload via fetch POST", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

      const client = createProxyRequest() as any;
      await client("api")("getUser", { id: 1 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![1].method).toBe("POST");

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          method: "getUser",
          variables: { id: 1 },
        }),
      );
    });

    it("parses group:method in endpoint key", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ token: "abc" }));

      const client = createProxyRequest() as any;
      await client("api")("auth:login", { email: "test@test.com" });

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          group: "auth",
          method: "login",
          variables: { email: "test@test.com" },
        }),
      );
    });

    it("sends endpoint without variables", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ users: [] }));

      const client = createProxyRequest() as any;
      await client("api")("list");

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          method: "list",
        }),
      );
      expect(body.variables).toBeUndefined();
    });
  });

  describe("FormData payload", () => {
    it("sends FormData with meta fields", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const fd = new FormData();
      fd.append("file", new File(["content"], "test.txt"));

      const client = createProxyRequest() as any;
      await client("api")("upload", fd);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0]![0];
      expect(url).toBe("/api/request");

      const body = fetchSpy.mock.calls[0]![1].body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("_source")).toBe("api");
      expect(body.get("_method")).toBe("upload");
      expect(body.has("file")).toBe(true);
    });
  });

  describe("defaults", () => {
    it("uses custom proxyUrl", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyRequest({ proxyUrl: "/api/custom-route" }) as any;
      await client("api")("list");

      expect(fetchSpy.mock.calls[0]![0]).toBe("/api/custom-route");
    });

    it("applies default timeout via AbortSignal", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyRequest({ timeout: 10000 }) as any;
      await client("api")("list");

      // Timeout is handled via AbortSignal, not passed as a fetch option
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });

    it("option timeout overrides default timeout", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyRequest({ timeout: 10000 }) as any;
      await client("api", { timeout: 5000 })("list");

      // Timeout is handled via AbortSignal, not passed as a fetch option
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });

    it("sends default headers", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyRequest({ headers: { "x-api-key": "abc" } }) as any;
      await client("api")("list");

      const headers = fetchSpy.mock.calls[0]![1].headers as Headers;
      expect(headers.get("x-api-key")).toBe("abc");
    });

    it("sends credentials: include by default", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyRequest() as any;
      await client("api")("list");

      expect(fetchSpy.mock.calls[0]![1].credentials).toBe("include");
    });
  });

  describe("stream mode", () => {
    it("returns raw response when stream is true", async () => {
      const streamResponse = new Response(null, { status: 200, headers: new Headers() });
      fetchSpy.mockResolvedValue(streamResponse);

      const client = createProxyRequest() as any;
      const result = await client("api", { stream: true })("events");

      expect(result).toBe(streamResponse);
    });

    it("includes stream option in JSON payload", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200, headers: new Headers() }));

      const client = createProxyRequest() as any;
      await client("api", { stream: true })("events");

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.options).toEqual(expect.objectContaining({ stream: true }));
    });
  });

  describe("callbacks", () => {
    it("calls globalOnSuccess with data", async () => {
      const data = { users: [] };
      fetchSpy.mockResolvedValue(mockFetchResponse(data));
      const onSuccess = vi.fn();

      const client = createProxyRequest({ onSuccess }) as any;
      await client("api")("list");

      expect(onSuccess).toHaveBeenCalledWith(data);
    });

    it("calls globalOnError on non-ok response", async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ error: "not found" }, 404),
      );
      const onError = vi.fn();

      const client = createProxyRequest({ onError }) as any;

      await expect(client("api")("missing")).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalledWith(expect.any(HTTPError));
    });
  });

  describe("error handling", () => {
    it("converts non-ok response to custom HTTPError", async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ message: "Server Error" }, 500),
      );

      const client = createProxyRequest() as any;

      try {
        await client("api")("fail");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(500);
      }
    });

    it("falls back to text when response.json() fails in error path", async () => {
      fetchSpy.mockResolvedValue(
        new Response("not valid json", {
          status: 500,
          headers: new Headers({ "content-type": "text/plain" }),
        }),
      );

      const client = createProxyRequest() as any;

      try {
        await client("api")("fail");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).data).toEqual({
          success: false,
          message: "HTTP 500",
        });
      }
    });

    it("re-throws non-fetch errors unchanged", async () => {
      fetchSpy.mockRejectedValue(new TypeError("network error"));

      const client = createProxyRequest() as any;

      await expect(client("api")("fail")).rejects.toThrow("network error");
    });

    it("handles stream error with simplified message", async () => {
      fetchSpy.mockResolvedValue(
        new Response("not json", {
          status: 502,
          headers: new Headers(),
        }),
      );

      const client = createProxyRequest() as any;

      try {
        await client("api", { stream: true })("events");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(502);
        expect((error as HTTPError).data).toEqual({
          success: false,
          message: "HTTP 502",
        });
      }
    });

    it("calls globalOnSuccess in stream mode", async () => {
      const streamResponse = new Response(null, { status: 200, headers: new Headers() });
      fetchSpy.mockResolvedValue(streamResponse);
      const onSuccess = vi.fn();

      const client = createProxyRequest({ onSuccess }) as any;
      await client("api", { stream: true })("events");

      expect(onSuccess).toHaveBeenCalledWith(streamResponse);
    });

    it("calls globalOnError in stream error path", async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ error: "fail" }, 500),
      );
      const onError = vi.fn();

      const client = createProxyRequest({ onError }) as any;

      await expect(client("api", { stream: true })("events")).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe("GET proxy mode", () => {
    it("uses GET method when method: GET is set", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ users: [] }));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET" })("users:getAll");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![1].method).toBe("GET");

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("_s")).toBe("api");
      expect(url.searchParams.get("_g")).toBe("users");
      expect(url.searchParams.get("_m")).toBe("getAll");
    });

    it("includes variables as query params", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET" })("users:list", { page: 2, limit: 10 });

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("_s")).toBe("api");
      expect(url.searchParams.get("_g")).toBe("users");
      expect(url.searchParams.get("_m")).toBe("list");
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("limit")).toBe("10");
    });

    it("omits _g when no group in endpoint key", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET" })("health");

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("_g")).toBeNull();
      expect(url.searchParams.get("_m")).toBe("health");
    });

    it("skips undefined/null variables", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET" })("list", { page: 1, filter: undefined, sort: null });

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("filter")).toBeNull();
      expect(url.searchParams.get("sort")).toBeNull();
    });

    it("includes server options as _o when non-empty", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET", rawData: true })("list");

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(JSON.parse(url.searchParams.get("_o")!)).toEqual({ rawData: true });
    });

    it("omits _o when server options are empty", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET" })("list");

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("_o")).toBeNull();
    });

    it("sends credentials and headers in GET mode", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest({ headers: { "x-key": "abc" } }) as any;
      await client("api", { method: "GET" })("list");

      const init = fetchSpy.mock.calls[0]![1];
      expect(init.credentials).toBe("include");

      const headers = init.headers as Headers;
      expect(headers.get("x-key")).toBe("abc");
    });

    it("calls globalOnSuccess in GET mode", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));
      const onSuccess = vi.fn();

      const client = createProxyRequest({ onSuccess }) as any;
      await client("api", { method: "GET" })("list");

      expect(onSuccess).toHaveBeenCalledWith({ ok: true });
    });

    it("converts non-ok response to custom HTTPError in GET mode", async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ error: "not found" }, 404),
      );

      const client = createProxyRequest() as any;

      try {
        await client("api", { method: "GET" })("missing");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(404);
      }
    });

    it("calls globalOnError in GET error path", async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({ error: "fail" }, 500),
      );
      const onError = vi.fn();

      const client = createProxyRequest({ onError }) as any;

      await expect(client("api", { method: "GET" })("fail")).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalled();
    });

    it("falls back to POST for FormData even with method: GET", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const fd = new FormData();
      fd.append("file", new File(["x"], "f.txt"));

      const client = createProxyRequest() as any;
      await client("api", { method: "GET" })("upload", fd);

      expect(fetchSpy.mock.calls[0]![1].method).toBe("POST");
    });

    it("uses custom proxyUrl in GET mode", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyRequest({ proxyUrl: "/api/custom" }) as any;
      await client("api", { method: "GET" })("list");

      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url.startsWith("/api/custom")).toBe(true);
    });
  });
});
