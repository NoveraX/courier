/**
 * The verb a proxy client sends a call with.
 *
 * Every call went to the proxy as POST unless it asked for GET, and React's
 * hooks never ask, so a read's `.cache()` never reached a browser or a CDN:
 * neither keeps the answer to a POST. A read now goes as GET, its variables
 * in the address, unless its variables are sensitive, it carries a body, or
 * the address would be too long.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineBoundary } from "../src/define/index";
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

describe("a proxy client built from a boundary", () => {
  it("sends the reads it lists as sensitive as POST, and the others as GET", async () => {
    const boundary = defineBoundary({
      source: "shop",
      expose: { search: "query", byEmail: "query" },
      sensitive: ["byEmail"],
    });
    const fromBoundary = createProxyCaller<ReturnType<typeof api>>("shop", { boundary });

    await fromBoundary.search({ q: "lamp" });
    await fromBoundary.byEmail({ email: "ada@example.com" });

    expect(proxied.map((call) => call.method)).toEqual(["GET", "POST"]);
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
