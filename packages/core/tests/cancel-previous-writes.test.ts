/**
 * Which calls `cancelPrevious` may cancel, and what it may be set to.
 *
 * It exists for reads: a search box sends a request per keystroke and only
 * the last answer matters. It leaves writes alone: applied to them, two
 * different creates to one path would lose the first with a 499, although
 * the server has usually received and applied it — so a write marked with
 * `.cancelPrevious()` is refused where it is written, and an API, a client
 * or a call that turns it on cancels its reads alone.
 *
 * It is `true` or `false` wherever it is set. Anything else given to an
 * API, a group, a client or a call is refused where it is given, rather
 * than read as on or off; `.cancelPrevious()`, like `.expose()`, turns it
 * on for `true` alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { ConfigurationError, HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint, stream } = courier();
const realFetch = globalThis.fetch;
let upstream: Upstream;

beforeEach(async () => {
  vi.stubGlobal("document", {});
  upstream = await startUpstream((request, res) => {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ method: request.method, body: request.body.toString() }));
    }, 50);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

/** An API that turns it on for everything it holds, writes among them. */
function api() {
  return defineApi({
    expose: true,
    name: "orders",
    baseURL: upstream.url,
    cancelPrevious: true,
    endpoints: {
      search: endpoint.get("orders").variables<{ q: string }>(),
      find: endpoint.post("orders/find").reads().variables<{ q: string }>(),
      create: endpoint.post("orders").variables<{ item: string }>(),
      replace: endpoint.put("orders").variables<{ item: string }>(),
      remove: endpoint.del("orders").variables<{ item: string }>(),
    },
  });
}

function status(error: unknown): number | undefined {
  return error instanceof HTTPError ? error.status : undefined;
}

const INVALID = expect.objectContaining({ code: "CANCEL_PREVIOUS_INVALID" });

describe("an endpoint that writes", () => {
  it.each([
    ["post", () => endpoint.post("orders")],
    ["put", () => endpoint.put("orders")],
    ["patch", () => endpoint.patch("orders")],
    ["delete", () => endpoint.del("orders")],
    ["closure", () => endpoint.via((http) => http.post("orders"))],
  ])("is refused .cancelPrevious() where it is written: %s", (_verb, written) => {
    // @ts-expect-error a write a newer call cancelled has usually been applied
    const marked = () => written().cancelPrevious();

    expect(marked).toThrow(ConfigurationError);
    expect(marked).toThrow(expect.objectContaining({ code: "CANCEL_PREVIOUS_ON_WRITE" }));
  });

  it("takes it once declared a read", () => {
    const find = endpoint.post("orders/find").reads().cancelPrevious();

    expect(find.options.cancelPrevious).toBe(true);
  });

  it("turns it on with no argument or true, and off with any other, as .expose() opens", () => {
    const bare = endpoint.get("orders").cancelPrevious();
    const given = endpoint.get("orders").cancelPrevious("yes" as unknown as boolean);

    expect(bare.options.cancelPrevious).toBe(true);
    expect(given.options.cancelPrevious).toBe(false);
  });

  it("names a closure, and a stream, for what they are", () => {
    // @ts-expect-error a closure is taken to write until .reads() says otherwise
    const closure = () => endpoint.via((http) => http.get("orders")).cancelPrevious();
    // @ts-expect-error a stream has no .cancelPrevious()
    const streamed = () => stream.get("feed").cancelPrevious();

    expect(closure).toThrow(/addressed with \.via\(\).*\.reads\(\)/);
    expect(streamed).toThrow(/a stream or a channel/);
  });
});

describe("a cancelPrevious that is neither true nor false", () => {
  const search = () => endpoint.get("orders").variables<{ q: string }>();

  it("is refused where the API is defined", () => {
    const define = () =>
      defineApi({
        baseURL: upstream.url,
        cancelPrevious: ["search"] as unknown as boolean,
        endpoints: { search: search() },
      });

    expect(define).toThrow(ConfigurationError);
    expect(define).toThrow(INVALID);
  });

  it("is refused where a group is defined", () => {
    const define = () =>
      defineGroup({
        cancelPrevious: "true" as unknown as boolean,
        endpoints: { search: search() },
      });

    expect(define).toThrow(INVALID);
  });

  it("is refused where a caller or a proxy client is made", () => {
    const direct = () => createCaller(api(), { cancelPrevious: 1 as unknown as boolean });
    const proxied = () =>
      createProxyCaller(routesOf(api(), "orders"), {
        cancelPrevious: ["search"] as unknown as boolean,
      });

    expect(direct).toThrow(INVALID);
    expect(proxied).toThrow(INVALID);
  });

  it("is refused where a proxy client is given routes that carry one, saying to write them again", () => {
    const routes = {
      ...routesOf(api(), "orders"),
      cancelPrevious: ["search"] as unknown as boolean,
    };

    const given = () => createProxyCaller(routes);

    expect(given).toThrow(INVALID);
    expect(given).toThrow(/routes of "orders".*courier-cli routes/);
  });

  it("is refused for a call, which rejects with it", async () => {
    registerSources({ orders: api() });
    const handler = createHandler();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });
    const given = { cancelPrevious: "yes" as unknown as boolean };

    const direct = createCaller(api()).with(given).search({ q: "a" });
    const proxied = createProxyCaller(routesOf(api(), "orders")).with(given).search({ q: "a" });

    await expect(direct).rejects.toThrow(INVALID);
    await expect(proxied).rejects.toThrow(INVALID);
    expect(upstream.received).toHaveLength(0);
  });
});

describe("cancelPrevious on a direct call", () => {
  it("still cancels a read superseded by the next one", async () => {
    const client = createCaller(api());

    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ method: "GET", body: "" });
  });

  it("cancels a POST the endpoint declares a read", async () => {
    const client = createCaller(api());

    const first = client.find({ q: "a" }).catch(status);
    const second = client.find({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ method: "POST", body: '{"q":"ab"}' });
  });

  it("lets two concurrent creates to one path both complete", async () => {
    const client = createCaller(api());

    const results = await Promise.all([client.create({ item: "A" }), client.create({ item: "B" })]);

    expect(results).toEqual([
      { method: "POST", body: '{"item":"A"}' },
      { method: "POST", body: '{"item":"B"}' },
    ]);
  });

  it.each(["replace", "remove"] as const)("does not cancel a concurrent %s", async (name) => {
    const client = createCaller(api());

    const settled = await Promise.allSettled([
      client[name]({ item: "A" }),
      client[name]({ item: "B" }),
    ]);

    expect(settled.map((s) => s.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(upstream.received).toHaveLength(2);
  });

  it("does not cancel a write a call asks to cancel", async () => {
    const client = createCaller(api()).with({ cancelPrevious: true });

    const settled = await Promise.allSettled([
      client.create({ item: "A" }),
      client.create({ item: "B" }),
    ]);

    expect(settled.map((s) => s.status)).toEqual(["fulfilled", "fulfilled"]);
  });
});

describe("cancelPrevious on a proxy client given its routes", () => {
  beforeEach(() => {
    const source = api();
    registerSources({ orders: source });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });
  });

  it("lets two concurrent creates both complete", async () => {
    const client = createProxyCaller(routesOf(api(), "orders"));

    const results = await Promise.all([client.create({ item: "A" }), client.create({ item: "B" })]);

    expect(results).toEqual([
      { method: "POST", body: '{"item":"A"}' },
      { method: "POST", body: '{"item":"B"}' },
    ]);
  });

  it("still cancels a superseded read", async () => {
    const client = createProxyCaller(routesOf(api(), "orders"));

    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ method: "GET", body: "" });
  });

  /**
   * The routes carry whether each endpoint reads or writes, so a client and
   * a call that turn it on tell a read from a write and cancel only reads.
   */
  describe("told by its page and its calls to cancel everything", () => {
    const toldClient = () =>
      createProxyCaller(routesOf(api(), "orders"), { cancelPrevious: true }).with({
        cancelPrevious: true,
      });

    it("lets two concurrent creates both complete", async () => {
      const client = toldClient();

      const results = await Promise.all([
        client.create({ item: "A" }),
        client.create({ item: "B" }),
      ]);

      expect(results).toEqual([
        { method: "POST", body: '{"item":"A"}' },
        { method: "POST", body: '{"item":"B"}' },
      ]);
    });

    it("does not cancel a concurrent replace", async () => {
      const client = toldClient();

      const settled = await Promise.allSettled([
        client.replace({ item: "A" }),
        client.replace({ item: "B" }),
      ]);

      expect(settled.map((s) => s.status)).toEqual(["fulfilled", "fulfilled"]);
    });

    it("still cancels a superseded read, whatever verb carries it", async () => {
      const client = toldClient();

      const first = client.search({ q: "a" }).catch(status);
      const second = client.search({ q: "ab" });
      const firstFind = client.find({ q: "a" }).catch(status);
      const secondFind = client.find({ q: "ab" });

      expect(await first).toBe(499);
      await expect(second).resolves.toEqual({ method: "GET", body: "" });
      expect(await firstFind).toBe(499);
      await expect(secondFind).resolves.toEqual({ method: "POST", body: '{"q":"ab"}' });
    });
  });
});
