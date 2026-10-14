/**
 * Identical reads in flight together reach the API once: requests that are
 * the same in every part — method, address, headers, every credential and
 * the user's address among them, body — share one answer, each call
 * reading a copy of its own. Anything that tells them apart sends them
 * apart: other variables, another user, another request being served. A
 * call that stops waiting leaves alone; the request is cancelled when the
 * last one leaves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { rememberPeerAddress } from "../src/adapter/peer-address";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { webIncomingRequest, withIncomingRequest } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;

let upstream: Upstream;
let delayMs = 60;

beforeEach(async () => {
  delayMs = 60;
  upstream = await startUpstream((request, res) => {
    setTimeout(() => {
      if (request.url.startsWith("/broken")) {
        res.writeHead(502, { "content-type": "application/json" }).end('{"message":"down"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: request.url, list: ["a"] }));
    }, delayMs);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function api(options: { coalesce?: boolean; forward?: { requestId: true } } = {}) {
  return defineApi({
    expose: true,
    name: "shop",
    baseURL: upstream.url,
    ...options,
    endpoints: {
      seo: endpoint
        .get("seo")
        .variables<{ page: string }>()
        .response<{ url: string; list: string[] }>(),
      items: endpoint.get("items").variables<{ page: number }>().response<unknown>(),
      broken: endpoint.get("broken"),
      order: endpoint.post("orders").variables<{ item: string }>(),
      search: endpoint.post("search").reads().variables<{ q: string }>(),
      byEmail: endpoint
        .get("customers", { sensitiveVariables: true })
        .variables<{ email: string }>(),
    },
  });
}

describe("identical reads in flight together", () => {
  it("reach the API once, each call with a copy of its own", async () => {
    const shop = createCaller(api());

    const [first, second] = await Promise.all([shop.seo({ page: "/" }), shop.seo({ page: "/" })]);

    expect(upstream.received).toHaveLength(1);
    first.list.push("edited");
    expect(second.list).toEqual(["a"]);
  });

  it("are sent apart when their variables differ: page one and page two", async () => {
    const shop = createCaller(api());

    await Promise.all([shop.items({ page: 1 }), shop.items({ page: 2 })]);

    expect(upstream.received.map(({ url }) => url).sort()).toEqual([
      "/items?page=1",
      "/items?page=2",
    ]);
  });

  it("are sent apart for two users, whose credentials differ", async () => {
    const forUser = (token: string) =>
      createCaller(api(), {
        context: {
          req: new Request("https://shop.example/", { headers: { authorization: token } }),
        },
      });

    await Promise.all([
      forUser("Bearer ada").seo({ page: "/" }),
      forUser("Bearer bob").seo({ page: "/" }),
    ]);

    expect(upstream.received.map(({ headers }) => headers.authorization).sort()).toEqual([
      "Bearer ada",
      "Bearer bob",
    ]);
  });

  it("share within the request a page renders, and not across two requests", async () => {
    const shop = createCaller(api({ forward: { requestId: true } }));
    const render = (id: string) =>
      withIncomingRequest(
        webIncomingRequest(
          new Request("https://shop.example/", { headers: { "x-request-id": id } }),
        ),
        () => Promise.all([shop.seo({ page: "/" }), shop.seo({ page: "/" })]),
      );

    await Promise.all([render("req-one"), render("req-two")]);

    expect(upstream.received.map(({ headers }) => headers["x-request-id"]).sort()).toEqual([
      "req-one",
      "req-two",
    ]);
  });

  it("are never writes", async () => {
    const shop = createCaller(api());

    await Promise.all([shop.order({ item: "book" }), shop.order({ item: "book" })]);

    expect(upstream.received).toHaveLength(2);
  });

  it("include a read sent as a POST, which its endpoint declares", async () => {
    const shop = createCaller(api());

    await Promise.all([shop.search({ q: "lamp" }), shop.search({ q: "lamp" })]);
    await Promise.all([shop.search({ q: "lamp" }), shop.search({ q: "desk" })]);

    expect(upstream.received.map(({ body }) => body.toString()).sort()).toEqual([
      '{"q":"desk"}',
      '{"q":"lamp"}',
      '{"q":"lamp"}',
    ]);
  });

  it("are joined for a source that sends with a fetch of its own", async () => {
    const sent = vi.fn((input: string, init: object) => realFetch(input, init as RequestInit));
    const shop = createCaller(
      defineApi({
        expose: true,
        name: "shop",
        baseURL: upstream.url,
        fetch: sent,
        endpoints: { seo: endpoint.get("seo").variables<{ page: string }>() },
      }),
    );

    await Promise.all([shop.seo({ page: "/" }), shop.seo({ page: "/" })]);

    expect(sent).toHaveBeenCalledTimes(1);
    expect(upstream.received).toHaveLength(1);
  });

  it("go apart when each is read as a stream, by a reader of its own", async () => {
    const shop = createCaller(api());

    const streams = await Promise.all([
      shop.with({ stream: true }).seo({ page: "/" }),
      shop.with({ stream: true }).seo({ page: "/" }),
    ]);
    await Promise.all(streams.map((body) => new Response(body as ReadableStream).text()));

    expect(upstream.received).toHaveLength(2);
  });

  it("go apart when the call or the API asks", async () => {
    await Promise.all([
      createCaller(api()).with({ coalesce: false }).seo({ page: "/" }),
      createCaller(api()).with({ coalesce: false }).seo({ page: "/" }),
      createCaller(api({ coalesce: false })).seo({ page: "/b" }),
      createCaller(api({ coalesce: false })).seo({ page: "/b" }),
    ]);

    expect(upstream.received).toHaveLength(4);
  });

  it("start one request again once its answer has arrived", async () => {
    const shop = createCaller(api());

    await shop.seo({ page: "/" });
    await shop.seo({ page: "/" });

    expect(upstream.received).toHaveLength(2);
  });

  it("share a failure, each call with an error of its own", async () => {
    const shop = createCaller(api());

    const settled = await Promise.allSettled([shop.broken(), shop.broken()]);

    expect(settled.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(settled.map((result) => result.status === "rejected" && result.reason.status)).toEqual([
      502, 502,
    ]);
    expect(upstream.received).toHaveLength(1);
  });
});

describe("a call that stops waiting", () => {
  it("leaves alone, and the other gets its answer", async () => {
    delayMs = 150;
    const shop = createCaller(api());
    const leaving = new AbortController();
    const staying = shop.seo({ page: "/" });
    const left = shop.with({ signal: leaving.signal }).seo({ page: "/" });

    leaving.abort();

    await expect(left).rejects.toMatchObject({ name: "AbortError" });
    await expect(staying).resolves.toMatchObject({ url: "/seo?page=%2F" });
    expect(upstream.received).toHaveLength(1);
  });

  it("times out alone", async () => {
    delayMs = 150;
    const shop = createCaller(api());

    const [patient, hasty] = await Promise.allSettled([
      shop.with({ timeout: 2000 }).seo({ page: "/" }),
      shop.with({ timeout: 30 }).seo({ page: "/" }),
    ]);

    expect(patient.status).toBe("fulfilled");
    expect(hasty.status === "rejected" && hasty.reason).toMatchObject({
      status: 0,
      message: "Request timed out",
      cause: expect.objectContaining({ name: "TimeoutError" }),
    });
  });
});

describe("through the proxy", () => {
  it("a browser's identical reads reach the proxy once", async () => {
    vi.stubGlobal("document", {});
    registerSources({ shop: api() });
    const handler = createHandler();
    const proxied = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
    });
    vi.stubGlobal("fetch", proxied);
    const shop = createProxyCaller<ReturnType<typeof api>>("shop", { source: api() });

    await Promise.all([shop.seo({ page: "/" }), shop.seo({ page: "/" })]);

    expect(
      proxied.mock.calls.filter(([input]) => !String(input).startsWith(upstream.url)),
    ).toHaveLength(1);
    expect(upstream.received).toHaveLength(1);
  });

  it("a read whose variables go as a POST's reaches the proxy once, as reads do", async () => {
    vi.stubGlobal("document", {});
    registerSources({ shop: api() });
    const handler = createHandler();
    const proxied = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
    });
    vi.stubGlobal("fetch", proxied);
    const shop = createProxyCaller<ReturnType<typeof api>>("shop", { source: api() });
    const email = "ada@example.com";

    await Promise.all([shop.byEmail({ email }), shop.byEmail({ email })]);

    const toProxy = proxied.mock.calls.filter(([input]) => !String(input).startsWith(upstream.url));
    expect(toProxy.map(([, init]) => init?.method)).toEqual(["POST"]);
  });

  it("a client sends each call alone when its API or the client says so", async () => {
    vi.stubGlobal("document", {});
    registerSources({ shop: api({ coalesce: false }) });
    const handler = createHandler();
    const proxied = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
    });
    vi.stubGlobal("fetch", proxied);
    const fromSource = createProxyCaller<ReturnType<typeof api>>("shop", {
      source: api({ coalesce: false }),
    });
    const saysSo = createProxyCaller<ReturnType<typeof api>>("shop", { coalesce: false });

    await Promise.all([fromSource.seo({ page: "/" }), fromSource.seo({ page: "/" })]);
    await Promise.all([saysSo.seo({ page: "/b" }), saysSo.seo({ page: "/b" })]);

    expect(
      proxied.mock.calls.filter(([input]) => !String(input).startsWith(upstream.url)),
    ).toHaveLength(4);
  });

  it("the server does not share one user's read with another's", async () => {
    registerSources({ shop: api() });
    const handler = createHandler();
    const read = (address: string) => {
      const variables = encodeURIComponent(JSON.stringify({ page: "/" }));
      const request = new Request(
        `http://app.localhost/api/request?_s=shop&_m=seo&_v=${variables}`,
      );
      rememberPeerAddress(request, address);
      return handler.handle(request);
    };

    await Promise.all([read("198.51.100.23"), read("198.51.100.24")]);

    expect(upstream.received).toHaveLength(2);
  });
});
