import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProxyCaller } from "../src/proxy-caller";
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

describe("createProxyCaller", () => {
  it("returns a proxy object (not a function)", () => {
    const client = createProxyCaller("api") as any;
    expect(typeof client).toBe("object");
  });

  describe("JSON payload", () => {
    it("sends correct JSON payload via fetch POST", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

      const client = createProxyCaller("api") as any;
      await client.users.getUser({ id: 1 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![1].method).toBe("POST");

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          group: "users",
          method: "getUser",
          variables: { id: 1 },
        }),
      );
    });

    it("sends group and method from dot notation", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ token: "abc" }));

      const client = createProxyCaller("api") as any;
      await client.auth.login({ email: "test@test.com" });

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

      const client = createProxyCaller("api") as any;
      await client.users.list();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          group: "users",
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

      const client = createProxyCaller("api") as any;
      await client.files.upload(fd);

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

      const client = createProxyCaller("api", { proxyUrl: "/api/custom-route" }) as any;
      await client.users.list();

      expect(fetchSpy.mock.calls[0]![0]).toBe("/api/custom-route");
    });

    it("applies default timeout via AbortSignal", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api", { timeout: 10000 }) as any;
      await client.users.list();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });

    it("sends default headers", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api", { headers: { "x-api-key": "abc" } }) as any;
      await client.users.list();

      const headers = fetchSpy.mock.calls[0]![1].headers as Headers;
      expect(headers.get("x-api-key")).toBe("abc");
    });

    it("sends credentials: include by default", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.users.list();

      expect(fetchSpy.mock.calls[0]![1].credentials).toBe("include");
    });
  });

  describe(".with() options", () => {
    it("passes timeout from .with() on client level", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.with({ timeout: 5000 }).users.list();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });

    it("passes timeout from .with() on group level", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.users.with({ timeout: 3000 }).list();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });
  });

  describe(".raw accessor", () => {
    it("includes rawData in options via client.group.raw.method()", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

      const client = createProxyCaller("api") as any;
      await client.users.raw.getById({ id: 1 });

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("includes rawData in options via client.raw.group.method()", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

      const client = createProxyCaller("api") as any;
      await client.raw.users.getById({ id: 1 });

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("preserves raw through .with()", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

      const client = createProxyCaller("api") as any;
      await client.users.raw.with({ timeout: 1000 }).getById({ id: 1 });

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });
  });

  describe("stream mode", () => {
    it("returns raw response when stream is true", async () => {
      const streamResponse = new Response(null, { status: 200, headers: new Headers() });
      fetchSpy.mockResolvedValue(streamResponse);

      const client = createProxyCaller("api") as any;
      const result = await client.events.with({ stream: true }).subscribe();

      expect(result).toBe(streamResponse);
    });

    it("includes stream option in JSON payload", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200, headers: new Headers() }));

      const client = createProxyCaller("api") as any;
      await client.events.with({ stream: true }).subscribe();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.options).toEqual(expect.objectContaining({ stream: true }));
    });
  });

  describe("callbacks", () => {
    it("calls globalOnSuccess with data", async () => {
      const data = { users: [] };
      fetchSpy.mockResolvedValue(mockFetchResponse(data));
      const onSuccess = vi.fn();

      const client = createProxyCaller("api", { onSuccess }) as any;
      await client.users.list();

      expect(onSuccess).toHaveBeenCalledWith(data);
    });

    it("calls globalOnError on non-ok response", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ error: "not found" }, 404));
      const onError = vi.fn();

      const client = createProxyCaller("api", { onError }) as any;

      await expect(client.users.missing()).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalledWith(expect.any(HTTPError));
    });
  });

  describe("error handling", () => {
    it("converts non-ok response to custom HTTPError", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ message: "Server Error" }, 500));

      const client = createProxyCaller("api") as any;

      try {
        await client.users.fail();
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(500);
      }
    });

    it("re-throws non-fetch errors unchanged", async () => {
      fetchSpy.mockRejectedValue(new TypeError("network error"));

      const client = createProxyCaller("api") as any;

      await expect(client.users.fail()).rejects.toThrow("network error");
    });
  });

  describe("GET proxy mode", () => {
    it("uses GET method when method: GET is set via .with()", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ users: [] }));

      const client = createProxyCaller("api") as any;
      await client.users.with({ method: "GET" }).getAll();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![1].method).toBe("GET");

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("_s")).toBe("api");
      expect(url.searchParams.get("_g")).toBe("users");
      expect(url.searchParams.get("_m")).toBe("getAll");
    });

    it("includes variables as query params in GET mode", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyCaller("api") as any;
      await client.users.with({ method: "GET" }).list({ page: 2, limit: 10 });

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("limit")).toBe("10");
    });
  });

  describe("flat mode (no groups)", () => {
    it("sends method without group for flat calls", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.healthCheck();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          method: "healthCheck",
        }),
      );
      expect(body.group).toBeUndefined();
    });

    it("sends variables in flat call", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyCaller("api") as any;
      await client.search({ query: "test" });

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body).toEqual(
        expect.objectContaining({
          source: "api",
          method: "search",
          variables: { query: "test" },
        }),
      );
    });

    it(".raw works on flat calls", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.raw.healthCheck();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.method).toBe("healthCheck");
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it(".with() works on flat calls", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.with({ timeout: 3000 }).healthCheck();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });
  });

  describe("dual proxy (mixed mode)", () => {
    it("same property works as both flat call and group accessor", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockFetchResponse("flat"))
        .mockResolvedValueOnce(mockFetchResponse("nested"));

      const client = createProxyCaller("api") as any;

      // Flat: client.users() → endpointKey = "users"
      await client.users();
      const body1 = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body1.method).toBe("users");
      expect(body1.group).toBeUndefined();

      // Nested: client.users.getAll() → group="users", method="getAll" → endpointKey = "users:getAll"
      await client.users.getAll();
      const body2 = JSON.parse(fetchSpy.mock.calls[1]![1].body);
      expect(body2.method).toBe("getAll");
      expect(body2.group).toBe("users");
    });

    it("method-level .raw() on flat call", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.healthCheck.raw();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.method).toBe("healthCheck");
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("method-level .with()() on flat call", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.healthCheck.with({ timeout: 2000 })();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1];
      expect(init.signal).toBeDefined();
    });

    it("method-level .raw.with()() chained on flat call", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.healthCheck.raw.with({ timeout: 1500 })();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.method).toBe("healthCheck");
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("client.raw.with().method() — combined at client level", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.raw.with({ timeout: 3000 }).healthCheck();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.method).toBe("healthCheck");
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("client.with().raw.group.method() — combined at client level for groups", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.with({ timeout: 3000 }).raw.users.getAll();

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.method).toBe("getAll");
      expect(body.group).toBe("users");
      expect(body.options).toEqual(expect.objectContaining({ rawData: true }));
    });
  });

  describe("proxy isolation", () => {
    it("client.raw does not affect subsequent calls", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockFetchResponse({ ok: true }))
        .mockResolvedValueOnce(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.raw.healthCheck();
      await client.healthCheck();

      const rawBody = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      const normalBody = JSON.parse(fetchSpy.mock.calls[1]![1].body);

      expect(rawBody.options).toEqual(expect.objectContaining({ rawData: true }));
      expect(normalBody.options?.rawData).toBeUndefined();
    });
  });

  describe("proxy safety", () => {
    it("does not trigger thenable detection", async () => {
      const client = createProxyCaller("api") as any;
      const result = await Promise.resolve(client);
      expect(result).toBe(client);
    });
  });
});
