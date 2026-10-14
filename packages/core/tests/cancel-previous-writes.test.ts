/**
 * Which calls `cancelPrevious` may cancel.
 *
 * It exists for reads: a search box sends a request per keystroke and only
 * the last answer matters. It leaves writes alone: applied to them, two
 * different creates to one path would lose the first with a 499, although
 * the server has usually received and applied it — so an API that names a
 * write in it is refused where it is defined, and a proxy client told to
 * cancel one cancels nothing its routes say writes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { ConfigurationError, HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
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

function api() {
  return defineApi({
    expose: true,
    name: "orders",
    baseURL: upstream.url,
    cancelPrevious: ["search", "find"],
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

describe("an API that names a write in cancelPrevious", () => {
  it.each([["create"], ["nowhere"]])("is refused where it is defined: %s", (path) => {
    const define = () =>
      defineApi({
        expose: true,
        name: "orders",
        baseURL: upstream.url,
        cancelPrevious: [path],
        endpoints: { create: endpoint.post("orders").variables<{ item: string }>() },
      });

    expect(define).toThrow(ConfigurationError);
    expect(define).toThrow(expect.objectContaining({ code: "CANCEL_PREVIOUS_INVALID" }));
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
   * The routes carry whether each endpoint reads or writes, so a client told
   * to cancel writes too tells a read from a write and cancels only reads.
   */
  describe("told by its page to cancel writes too", () => {
    const toldClient = () =>
      createProxyCaller(routesOf(api(), "orders"), {
        cancelPrevious: ["search", "find", "create", "replace"],
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
