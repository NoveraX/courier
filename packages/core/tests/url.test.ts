/**
 * Resolving an endpoint's path against its source, and filling its parameters.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { retryMiddleware } from "../src/middleware/retry";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { compileUrl, resolveBasePath } from "../src/utils/url";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";

describe("an endpoint path that begins with the letters http", () => {
  it("is a path, not an absolute URL", () => {
    expect(resolveBasePath("api", "httpbin/get")).toEqual({ path: "api/httpbin/get" });
  });

  it("is still an absolute URL when it has a scheme", () => {
    expect(resolveBasePath("api", "https://other.example/v2")).toEqual({
      path: "v2",
      baseUrl: "https://other.example",
    });
  });
});

const { endpoint } = courier();

let upstream: EchoServer;

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

describe("a path parameter's value", () => {
  const items = defineGroup({
    prefix: "items",
    endpoints: { one: endpoint.get(":id/details").variables<{ id: unknown }>() },
  });

  function client() {
    return createCaller(defineApi({ baseURL: upstream.origin, groups: { items } }));
  }

  async function refusal(id: unknown): Promise<unknown> {
    return client()
      .items.one({ id })
      .catch((error: unknown) => error);
  }

  it.each([
    ["..", ".."],
    [".", "."],
    ["an empty string", ""],
    ["null", null],
  ])("is refused before any request when it is %s", async (_, id) => {
    const failure = await refusal(id);

    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(400);
    expect(upstream.received).toHaveLength(0);
  });

  it("is sent when it is the word undefined", async () => {
    await client().items.one({ id: "undefined" });

    expect(upstream.last().url).toBe("/items/undefined/details");
  });

  it("keeps dots that are part of a longer value", async () => {
    await client().items.one({ id: "v1.2..3" });

    expect(upstream.last().url).toBe("/items/v1.2..3/details");
  });

  it("is refused through the proxy when it would climb out of the path", async () => {
    registerSources({
      api: defineApi({ name: "api", baseURL: upstream.origin, groups: { items } }),
    });

    const response = await createHandler().handlePost(
      new Request("http://app.localhost/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "api",
          group: "items",
          method: "one",
          variables: { id: ".." },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(upstream.received).toHaveLength(0);
  });
});

describe("an endpoint's path written as an absolute URL", () => {
  function client() {
    const elsewhere = `${upstream.origin}/elsewhere`;
    return createCaller(
      defineApi({
        baseURL: `${upstream.origin}/base`,
        endpoints: {
          braced: endpoint.get(`${elsewhere}/users/{id}`).variables<{ id: string }>(),
          spanning: endpoint.get(`${elsewhere}/v1/{+name}`).variables<{ name: string }>(),
          suffixed: endpoint.get(`${elsewhere}/files/{id}abc`).variables<{ id: string }>(),
          colon: endpoint.get(`${elsewhere}/users/:id`).variables<{ id: string }>(),
          queried: endpoint.get(`${elsewhere}/items?sort=asc`).variables<{ page: number }>(),
        },
      }),
    );
  }

  it("fills its parameters as a relative path does, a parameter in braces too", async () => {
    await client().braced({ id: "7" });
    await client().spanning({ name: "projects/p/operations/o" });
    await client().suffixed({ id: "x/7" });
    await client().colon({ id: "7" });

    expect(upstream.received.map((request) => request.url)).toEqual([
      "/elsewhere/users/7",
      "/elsewhere/v1/projects/p/operations/o",
      "/elsewhere/files/x%2F7abc",
      "/elsewhere/users/7",
    ]);
  });

  it("sends the query it writes, with a read's variables after it", async () => {
    await client().queried({ page: 2 });

    expect(upstream.last().url).toBe("/elsewhere/items?sort=asc&page=2");
  });
});

describe("a FormData that fills a path parameter", () => {
  const items = defineGroup({
    prefix: "items",
    endpoints: { attach: endpoint.post(":id/files").variables<FormData>() },
  });

  function form(): FormData {
    const data = new FormData();
    data.append("id", "77");
    data.append("note", "hello");
    return data;
  }

  it("is left as the caller built it", async () => {
    const data = form();

    await createCaller(defineApi({ baseURL: upstream.origin, groups: { items } })).items.attach(
      data,
    );

    expect([...data.keys()]).toEqual(["id", "note"]);
    expect(upstream.last().url).toBe("/items/77/files");
  });

  it("can be sent a second time", async () => {
    const data = form();
    const client = createCaller(defineApi({ baseURL: upstream.origin, groups: { items } }));

    await client.items.attach(data);
    await client.items.attach(data);

    expect(upstream.received.map((request) => request.url)).toEqual([
      "/items/77/files",
      "/items/77/files",
    ]);
    expect(upstream.last().body.toString()).toContain("hello");
  });

  it("is sent again whole when the call is retried", async () => {
    /* An upload is a write, sent again only when the policy allows repeats. */
    const api = defineApi({
      baseURL: upstream.origin,
      middleware: [retryMiddleware({ limit: 1, delay: 0, retryOn: () => true, mutations: true })],
      groups: { items },
    });

    await createCaller(api).items.attach(form());

    expect(upstream.received.map((request) => request.url)).toEqual([
      "/items/77/files",
      "/items/77/files",
    ]);
  });
});

describe("resolveBasePath", () => {
  it("returns prefix when no basePath", () => {
    expect(resolveBasePath("users")).toEqual({ path: "users" });
  });

  it("returns prefix when basePath is empty", () => {
    expect(resolveBasePath("users", "")).toEqual({ path: "users" });
  });

  it("joins prefix and relative basePath", () => {
    expect(resolveBasePath("api", "v2")).toEqual({ path: "api/v2" });
  });

  it("extracts origin from absolute URL basePath", () => {
    expect(resolveBasePath("api", "https://example.com/v2")).toEqual({
      path: "v2",
      baseUrl: "https://example.com",
    });
  });

  it("handles absolute URL with trailing slash", () => {
    expect(resolveBasePath("api", "https://example.com/v2/")).toEqual({
      path: "v2/",
      baseUrl: "https://example.com",
    });
  });
});

describe("compileUrl", () => {
  it("returns url unchanged when no path params", () => {
    const [url, vars, search] = compileUrl("users/list", { page: "1" });
    expect(url).toBe("users/list");
    expect(vars).toEqual({ page: "1" });
    expect(search).toEqual({});
  });

  it("compiles path params from variables", () => {
    const [url, vars] = compileUrl("users/:id", { id: "42", name: "test" });
    expect(url).toBe("users/42");
    expect(vars).toEqual({ name: "test" });
  });

  it("sends a doubled colon as one, beside the parameter its segment holds", () => {
    const [url, vars] = compileUrl("v1/:name::cancel", { name: "op-1", force: true });
    expect(url).toBe("v1/op-1:cancel");
    expect(vars).toEqual({ force: true });
  });

  it("removes path params from variables", () => {
    const [, vars] = compileUrl("users/:id/posts/:postId", {
      id: "1",
      postId: "2",
      extra: "keep",
    });
    expect(vars).toEqual({ extra: "keep" });
  });

  it("parses query string from URL", () => {
    const [url, , search] = compileUrl("users?page=1&limit=10");
    expect(url).toBe("users");
    expect(search).toEqual({ page: "1", limit: "10" });
  });

  it("uses custom searchParamsSerializer.parse", () => {
    const serializer = {
      stringify: (obj: Record<string, unknown>) =>
        new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)])).toString(),
      parse: (s: string) => ({ custom: s }),
    };
    const [, , search] = compileUrl("users?raw", undefined, undefined, serializer);
    expect(search).toEqual({ custom: "raw" });
  });

  it("uses generatedPathOptions for path params", () => {
    const [url] = compileUrl("users/:id", {}, { id: "99" });
    expect(url).toBe("users/99");
  });

  it("keeps generatedPathOptions over a variable of the same name", () => {
    const [url] = compileUrl("users/:id", { id: "42" }, { id: "99" });
    expect(url).toBe("users/99");
  });

  it("throws HTTPError when path param is missing", () => {
    expect(() => compileUrl("users/:id")).toThrow();
  });

  it("removes path params from FormData", () => {
    const fd = new FormData();
    fd.append("id", "42");
    fd.append("name", "test");
    const [url, vars] = compileUrl("users/:id", fd);
    expect(url).toBe("users/42");
    expect(vars).toBeInstanceOf(FormData);
    expect((vars as FormData).has("id")).toBe(false);
    expect((vars as FormData).get("name")).toBe("test");
  });
});
