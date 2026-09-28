/**
 * The proxy boundary: one declaration that says what the browser may call and
 * is the only thing the browser is told.
 *
 * The cases here pin both halves against the same declaration, because the
 * point of the feature is that they cannot drift — a list that gates the
 * server but describes something else to the client is two lists.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { defineBoundary } from "../src/define/boundary";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { isConfigurationError } from "../src/errors";
import type { Context } from "../src/http-client/types";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { executeRequest } from "../src/utils/execute";

const { channel, endpoint, stream } = courier();

const groups = {
    posts: defineGroup({
      prefix: "posts",
      endpoints: {
        list: endpoint.get("").response<unknown>(),
        feed: stream.get("events").response<unknown>(),
        room: channel.connect("room").response<unknown>(),
        chat: channel.connect("chat").response<unknown>().send<{ text: string }>(),
      },
    }),
    admin: defineGroup({
      prefix: "admin",
      endpoints: {
        exportPayouts: endpoint.get("payouts/export").response<unknown>(),
        purge: endpoint.del("purge").response<unknown>(),
      },
    }),
};

const api = defineApi({ baseURL: "https://internal-api.corp.example", groups });

const boundary = defineBoundary({
  source: "api",
  expose: {
    "posts.list": "query",
    "posts.feed": "stream",
    "posts.room": "channel",
    "posts.chat": "duplex",
  },
});

const fetchSpy = vi.fn();

/** The source as the registry holds it, with the boundary attached. */
function gatedSource() {
  const options = (api as unknown as { options: Record<string, unknown> }).options;
  return { ...(api as object), options: { ...options, boundary } } as unknown;
}

async function fromBrowser(group: string, method: string) {
  const response = (await executeRequest(
    { api: gatedSource() } as never,
    { source: "api", group, method } as never,
    {
      res: new Response(),
      proxyMethod: "GET",
      req: new Request("https://app.example.com/api/request"),
    } as Context & { res: Response },
  )) as Response;

  return { status: response.status, body: await response.text() };
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defineBoundary — what it describes", () => {
  it("names only the endpoints it was given", () => {
    expect(Object.keys(boundary.endpoints).sort()).toEqual([
      "posts.chat",
      "posts.feed",
      "posts.list",
      "posts.room",
    ]);
  });

  it("carries no trace of the endpoints it kept back", () => {
    const serialized = JSON.stringify(boundary);

    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("purge");
    expect(serialized).not.toContain("payouts");
  });

  it("carries nothing about the server's own side", () => {
    const serialized = JSON.stringify(boundary);

    expect(serialized).not.toContain("internal-api.corp.example");
    expect(serialized).not.toContain("baseURL");
    expect(serialized).not.toContain("middleware");
  });

  it("derives each transport from the API rather than being told, including whether a socket sends back", () => {
    expect(boundary.endpoints["posts.list"]).toEqual({ type: "query" });
    expect(boundary.endpoints["posts.feed"]).toEqual({ transport: "sse" });
    expect(boundary.endpoints["posts.room"]).toEqual({ transport: "ws" });
    expect(boundary.endpoints["posts.chat"]).toEqual({ transport: "ws", bidirectional: true });
  });

  it("is plain data, so it can be serialized to the client as it stands", () => {
    expect(JSON.parse(JSON.stringify(boundary))).toEqual(boundary);
  });

  it("records whether an HTTP endpoint reads or writes", () => {
    const both = defineBoundary({
      source: "api",
      expose: { "posts.list": "query", "admin.purge": "mutation" },
    });

    expect(both.endpoints["posts.list"]).toEqual({ type: "query" });
    expect(both.endpoints["admin.purge"]).toEqual({ type: "mutation" });
  });

  it("does not compile on the API when a read is declared a write, a write a read, or a path is misspelt", () => {
    const baseURL = "https://internal-api.corp.example";
    const readAsWrite = defineBoundary({ source: "api", expose: { "posts.list": "mutation" } });
    const writeAsRead = defineBoundary({ source: "api", expose: { "admin.purge": "query" } });
    const misspelt = defineBoundary({ source: "api", expose: { "posts.list": "query", "posts.lsit": "query" } });

    // @ts-expect-error — a GET endpoint reads
    defineApi({ baseURL, groups, boundary: readAsWrite });
    // @ts-expect-error — a DELETE endpoint writes
    defineApi({ baseURL, groups, boundary: writeAsRead });
    // @ts-expect-error — the API declares no posts.lsit
    defineApi({ baseURL, groups, boundary: misspelt });
  });

  it("does not compile a shape that is none of the five", () => {
    // @ts-expect-error — the shape says how the endpoint is reached
    defineBoundary({ source: "api", expose: { "admin.exportPayouts": "request" } });
  });
});

describe("defineBoundary — what it refuses", () => {
  it("serves an endpoint it names", async () => {
    const { status } = await fromBrowser("posts", "list");

    expect(status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses an endpoint it does not name", async () => {
    const { body } = await fromBrowser("admin", "exportPayouts");

    expect(body).toContain("method not found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a sibling in an otherwise open group", async () => {
    const narrow = defineBoundary({
      source: "api",
      expose: { "posts.list": "query" },
    });
    const options = (api as unknown as { options: Record<string, unknown> }).options;
    const source = { ...(api as object), options: { ...options, boundary: narrow } };

    const response = (await executeRequest(
      { api: source } as never,
      { source: "api", group: "posts", method: "feed" } as never,
      {
        res: new Response(),
        proxyMethod: "GET",
        req: new Request("https://app.example.com/api/request"),
      } as Context & { res: Response },
    )) as Response;

    expect(await response.text()).toContain("method not found");
  });

  it("answers a withheld endpoint exactly as it answers an invented one", async () => {
    const withheld = await fromBrowser("admin", "purge");
    const invented = await fromBrowser("admin", "noSuchThing");

    const shape = (body: string, name: string) => body.replace(name, "<name>");

    expect(withheld.status).toBe(invented.status);
    expect(shape(withheld.body, "purge")).toBe(shape(invented.body, "noSuchThing"));
  });

  it("overrules the coarser flags wherever it is declared", async () => {
    const options = (api as unknown as { options: Record<string, unknown> }).options;
    const source = { ...(api as object), options: { ...options, expose: true, boundary } };

    const response = (await executeRequest(
      { api: source } as never,
      { source: "api", group: "admin", method: "purge" } as never,
      {
        res: new Response(),
        proxyMethod: "GET",
        req: new Request("https://app.example.com/api/request"),
      } as Context & { res: Response },
    )) as Response;

    expect(await response.text()).toContain("method not found");
  });
});

/** A server-side caller holds the source and never addresses anything by name. */
describe("defineBoundary — in-process calls are untouched", () => {
  it("reaches a withheld endpoint from server code", async () => {
    await executeRequest({ api: gatedSource() } as never, {
      source: "api",
      group: "admin",
      method: "exportPayouts",
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * Forgetting to expose an endpoint used to surface as a type error deep in
 * user code — a stream fell through to the HTTP executor and failed later as
 * "sub is not async iterable", naming neither the endpoint nor the reason.
 */
describe("defineBoundary — a client says what it cannot call", () => {
  function clientFor(exposed: Record<string, string>) {
    return createProxyCaller("api", {
      boundary: defineBoundary({
        source: "api",
        proxyPath: { http: "/api/request" },
        expose: exposed as never,
      }),
    }) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  }

  it("names the endpoint and what to do about it", () => {
    const client = clientFor({ "posts.list": "query" });

    expect(() => client.posts!.feed!({})).toThrow(/posts\.feed.*boundary/s);
    expect(() => client.posts!.feed!({})).toThrow(/expose/);
  });

  it("refuses it as a configuration error a caller can tell apart", () => {
    const client = clientFor({ "posts.list": "query" });

    let refusal: unknown;
    try {
      client.posts!.feed!({});
    } catch (error) {
      refusal = error;
    }

    expect(isConfigurationError(refusal)).toBe(true);
    expect(refusal).toMatchObject({ code: "ENDPOINT_NOT_IN_BOUNDARY" });
  });

  it("still calls what the boundary does name", () => {
    const client = clientFor({ "posts.list": "query" });

    expect(() => client.posts!.list!({})).not.toThrow(/boundary/);
  });
});

/**
 * The docs promised that the server refuses what a boundary does not name,
 * but showed it given to the client only, and nothing public attached it to
 * the server's source. An app wired as documented served every endpoint.
 */
describe("defineBoundary — the server's half, wired as documented", () => {
  const upstreamHits: string[] = [];
  const upstream: Server = createServer((req, res) => {
    upstreamHits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[]");
  });

  /* The API reads its address from the environment when its module loads,
     as an application's does, so the module loads once, after the upstream
     is listening. */
  beforeAll(async () => {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    vi.stubEnv("SHOP_API_URL", `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    const { shop } = await import("./fixtures/shop-api");
    registerSources({ shop });
  });

  afterEach(() => {
    _resetSourcesForTests();
    upstreamHits.length = 0;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  function post(method: string): Promise<Response> {
    return createHandler().handle(
      new Request(`http://app.localhost/api/request?_s=shop&_g=orders&_m=${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
  }

  it("refuses a raw call to an endpoint the boundary does not name", async () => {
    const response = await post("purge");

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("method not found");
    expect(upstreamHits).toEqual([]);
  });

  it("serves an endpoint the boundary names", async () => {
    const response = await post("list");

    expect(response.status).toBe(200);
    expect(upstreamHits).toEqual(["GET /orders"]);
  });

  it("types the client from the API that holds it, with only the endpoints it names", async () => {
    const { shop } = await import("./fixtures/shop-api");
    const { shopBoundary } = await import("./fixtures/shop-boundary");
    const client = createProxyCaller<typeof shop>("shop", { boundary: shopBoundary });

    expectTypeOf(client.orders.list).returns.resolves.toEqualTypeOf<{ id: number }[]>();
    // @ts-expect-error — the boundary does not name orders.purge, and a call to it is refused
    expect(() => client.orders.purge()).toThrow(/boundary/);
  });
});

describe("defineBoundary — registered under another source", () => {
  afterEach(() => {
    _resetSourcesForTests();
  });

  it("is refused when the sources are registered", () => {
    // @ts-expect-error — billing declares none of the paths this boundary names
    const billing = defineApi({ baseURL: "https://billing.example", boundary, endpoints: {} });

    let thrown: unknown;
    try {
      registerSources({ billing });
    } catch (error) {
      thrown = error;
    }

    expect(isConfigurationError(thrown) && thrown.code).toBe("BOUNDARY_SOURCE_MISMATCH");
  });
});
