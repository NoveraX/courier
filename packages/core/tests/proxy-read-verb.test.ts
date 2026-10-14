/**
 * The verb a proxy client sends a call with.
 *
 * A read that may be cached goes as GET, its variables in the address, so its
 * `.cache()` reaches a browser and a CDN, neither of which keeps the answer to
 * a POST — unless its variables are sensitive, it carries a body, or the
 * address would be too long. Any other read goes as POST, as a write does:
 * GET would gain it nothing, and a read nobody marked keeps its variables out
 * of every log on the way. A caller may still ask for either verb.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { type CourierRoutes, courier, defineApi, defineBoundary } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;
let upstream: Upstream;
let proxied: { method: string; url: URL; cacheControl: string | null }[];

function api() {
  return defineApi({
    name: "shop",
    baseURL: upstream.url,
    groups: {},
    endpoints: {
      search: endpoint.get("products").variables<{ q: string }>().cache({ revalidate: 60 }),
      recent: endpoint.get("products/recent").variables<{ page: number }>(),
      byEmail: endpoint
        .get("customers", { sensitiveVariables: true })
        .variables<{ email: string }>(),
      order: endpoint.post("orders").variables<{ item: string }>(),
      upload: endpoint.post("files").reads().variables<FormData>(),
    },
  });
}

beforeEach(async () => {
  upstream = await startUpstream((_request, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  registerSources({ shop: api() });
  /* The proxy client as a browser runs it; a server's own reaches its proxy in process. */
  vi.stubGlobal("document", {});
  const handler = createHandler();
  proxied = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(upstream.url)) return realFetch(input, init);
    const request = new Request(new URL(url, "http://app.local"), init);
    const response = await handler.handle(request);
    proxied.push({
      method: request.method,
      url: new URL(request.url),
      cacheControl: response.headers.get("cache-control"),
    });
    return response;
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function client() {
  return createProxyCaller<ReturnType<typeof api>>("shop", { source: api() });
}

describe("a proxy client", () => {
  it("sends a read as GET with its variables in the address, and the answer may be cached", async () => {
    await client().search({ q: "lamp" });

    expect(proxied).toEqual([
      expect.objectContaining({
        method: "GET",
        cacheControl: "s-maxage=60, stale-while-revalidate",
      }),
    ]);
    expect(proxied[0]?.url.searchParams.get("_v")).toBe('{"q":"lamp"}');
  });

  it("sends a read that declares no cache as POST, its variables out of the address", async () => {
    await client().recent({ page: 2 });

    expect(proxied.map((call) => [call.method, call.url.search])).toEqual([
      ["POST", "?_s=shop&_m=recent"],
    ]);
  });

  it("sends a write as POST", async () => {
    await client().order({ item: "lamp" });

    expect(proxied.map((call) => call.method)).toEqual(["POST"]);
  });

  it("sends a read whose variables are sensitive as POST, keeping them out of the address", async () => {
    await client().byEmail({ email: "ada@example.com" });

    expect(proxied.map((call) => call.method)).toEqual(["POST"]);
    expect(proxied[0]?.url.search).not.toContain("ada");
  });

  it("sends a read as POST when its variables would make the address too long", async () => {
    await client().search({ q: "x".repeat(3_000) });

    expect(proxied.map((call) => call.method)).toEqual(["POST"]);
  });

  it("sends a read that carries a body as POST", async () => {
    const form = new FormData();
    form.set("file", new Blob(["hi"]), "hi.txt");

    await client().upload(form);

    expect(proxied.map((call) => call.method)).toEqual(["POST"]);
  });

  it("sends a call the method it asks for", async () => {
    await client().search.with({ method: "POST" })({ q: "lamp" });

    expect(proxied.map((call) => call.method)).toEqual(["POST"]);
  });
});

describe("a proxy client built from routes", () => {
  it("sends a read they mark as cacheable as GET, and every other call as POST", async () => {
    const endpoints = {
      search: { type: "query", get: true },
      recent: { type: "query" },
      order: { type: "mutation" },
    } as const;
    const routes: CourierRoutes<ReturnType<typeof api>, typeof endpoints> = {
      source: "shop",
      endpoints,
    };
    const fromRoutes = createProxyCaller(routes);

    await fromRoutes.search({ q: "lamp" });
    await fromRoutes.recent({ page: 1 });
    await fromRoutes.order({ item: "lamp" });

    expect(proxied.map((call) => call.method)).toEqual(["GET", "POST", "POST"]);
  });
});

describe("a proxy client built from a boundary", () => {
  it("sends every read as POST, as a boundary does not say which may be cached", async () => {
    const boundary = defineBoundary({
      source: "shop",
      expose: { search: "query", byEmail: "query" },
      sensitive: ["byEmail"],
    });
    const fromBoundary = createProxyCaller<ReturnType<typeof api>>("shop", { boundary });

    await fromBoundary.search({ q: "lamp" });
    await fromBoundary.byEmail({ email: "ada@example.com" });

    expect(proxied.map((call) => call.method)).toEqual(["POST", "POST"]);
  });
});

describe("the proxy", () => {
  it("refuses a read whose variables are sensitive over GET", async () => {
    const failure = await client()
      .byEmail.with({ method: "GET" })({ email: "ada@example.com" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HTTPError);
    expect(failure).toMatchObject({ status: 405 });
    expect(upstream.received).toEqual([]);
  });
});
