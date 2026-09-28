import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProxyCaller } from "../src/proxy-caller";
import { HTTPError } from "../src/errors";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

/** What call `index` named in its URL, and what its body carried. */
function sent(index = 0) {
  const [url, init] = fetchSpy.mock.calls[index]!;
  const query = new URL(String(url), "http://localhost").searchParams;
  return {
    source: query.get("_s"),
    group: query.get("_g") ?? undefined,
    method: query.get("_m"),
    body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
  };
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

      expect(sent()).toEqual({
        source: "api",
        group: "users",
        method: "getUser",
        body: { variables: { id: 1 }, options: {} },
      });
    });

    it("sends group and method from dot notation", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ token: "abc" }));

      const client = createProxyCaller("api") as any;
      await client.auth.login({ email: "test@test.com" });

      expect(sent()).toEqual({
        source: "api",
        group: "auth",
        method: "login",
        body: { variables: { email: "test@test.com" }, options: {} },
      });
    });

    it("sends endpoint without variables", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ users: [] }));

      const client = createProxyCaller("api") as any;
      await client.users.list();

      expect(sent()).toMatchObject({ source: "api", group: "users", method: "list" });
      expect(sent().body.variables).toBeUndefined();
    });
  });

  describe("FormData payload", () => {
    it("names the endpoint in the URL and sends the form with its options first", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const fd = new FormData();
      fd.append("file", new File(["content"], "test.txt"));

      const client = createProxyCaller("api") as any;
      await client.files.upload(fd);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = new URL(String(fetchSpy.mock.calls[0]![0]));
      expect(url.pathname).toBe("/api/request");
      expect(sent()).toMatchObject({ source: "api", group: "files", method: "upload" });

      const body = sent().body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect([...body.keys()]).toEqual(["_options", "file"]);
      expect(body.get("_options")).toBe("{}");
    });
  });

  describe("defaults", () => {
    it("uses custom proxyPath.http", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api", {
        proxyPath: { http: "/api/custom-route" },
      }) as any;
      await client.users.list();

      // resolveProxyPath returns an absolute URL — assert by suffix so the
      // test is independent of the test runner's location.host.
      expect(new URL(String(fetchSpy.mock.calls[0]![0])).pathname).toBe("/api/custom-route");
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
    it("resolves a streamed call to the unread body, as direct mode does", async () => {
      const body = new ReadableStream();
      fetchSpy.mockResolvedValue(new Response(body, { status: 200 }));

      const client = createProxyCaller("api") as any;
      const result = await client.events.with({ stream: true }).subscribe();

      expect(result).toBe(body);
    });

    it("resolves a raw streamed call to the response around the body", async () => {
      fetchSpy.mockResolvedValue(
        new Response(new ReadableStream(), { status: 206, headers: { "content-type": "text/plain" } }),
      );

      const client = createProxyCaller("api") as any;
      const result = await client.events.raw.with({ stream: true }).subscribe();

      expect(result.status).toBe(206);
      expect(result.headers.get("content-type")).toBe("text/plain");
      expect(result.data).toBeInstanceOf(ReadableStream);
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

    it("reports a failure to reach the proxy as an HTTPError with status 0", async () => {
      const cause = new TypeError("network error");
      fetchSpy.mockRejectedValue(cause);

      const client = createProxyCaller("api") as any;
      const error = await client.users.fail().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HTTPError);
      expect(error.status).toBe(0);
      expect(error.cause).toBe(cause);
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

    it("sends the variables as one JSON parameter in GET mode, keeping their types", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyCaller("api") as any;
      await client.users.with({ method: "GET" }).list({ page: 2, tags: ["a", "b"] });

      const url = new URL(fetchSpy.mock.calls[0]![0], "http://localhost");
      expect(JSON.parse(url.searchParams.get("_v") ?? "")).toEqual({ page: 2, tags: ["a", "b"] });
      expect(url.searchParams.has("page")).toBe(false);
    });
  });

  describe("flat mode (no groups)", () => {
    it("sends method without group for flat calls", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.healthCheck();

      expect(sent()).toMatchObject({ source: "api", group: undefined, method: "healthCheck" });
    });

    it("sends variables in flat call", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]));

      const client = createProxyCaller("api") as any;
      await client.search({ query: "test" });

      expect(sent()).toMatchObject({
        source: "api",
        method: "search",
        body: { variables: { query: "test" } },
      });
    });

    it(".raw works on flat calls", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.raw.healthCheck();

      expect(sent().method).toBe("healthCheck");
      expect(sent().body.options).toEqual(expect.objectContaining({ rawData: true }));
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
      expect(sent(0)).toMatchObject({ method: "users", group: undefined });

      // Nested: client.users.getAll() → group="users", method="getAll" → endpointKey = "users:getAll"
      await client.users.getAll();
      expect(sent(1)).toMatchObject({ method: "getAll", group: "users" });
    });

    it("method-level .raw() on flat call", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.healthCheck.raw();

      expect(sent().method).toBe("healthCheck");
      expect(sent().body.options).toEqual(expect.objectContaining({ rawData: true }));
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

      expect(sent().method).toBe("healthCheck");
      expect(sent().body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("client.raw.with().method() — combined at client level", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.raw.with({ timeout: 3000 }).healthCheck();

      expect(sent().method).toBe("healthCheck");
      expect(sent().body.options).toEqual(expect.objectContaining({ rawData: true }));
    });

    it("client.with().raw.group.method() — combined at client level for groups", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const client = createProxyCaller("api") as any;
      await client.with({ timeout: 3000 }).raw.users.getAll();

      expect(sent()).toMatchObject({ method: "getAll", group: "users" });
      expect(sent().body.options).toEqual(expect.objectContaining({ rawData: true }));
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
