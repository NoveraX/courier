/**
 * Which calls `deduplicate` may cancel.
 *
 * It exists for reads: a search box sends a request per keystroke and only
 * the last answer matters. Applied to every call, it cancelled writes as
 * well — two different creates to one path lost the first with a 499,
 * although the server had usually received and applied it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
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
    name: "orders",
    baseURL: upstream.url,
    deduplicate: true,
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

describe("deduplicate on a direct call", () => {
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

    const results = await Promise.all([
      client.create({ item: "A" }),
      client.create({ item: "B" }),
    ]);

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

describe("deduplicate on a proxy client given the source", () => {
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
    const client = createProxyCaller<ReturnType<typeof api>>("orders", { source: api() });

    const results = await Promise.all([
      client.create({ item: "A" }),
      client.create({ item: "B" }),
    ]);

    expect(results).toEqual([
      { method: "POST", body: '{"item":"A"}' },
      { method: "POST", body: '{"item":"B"}' },
    ]);
  });

  it("still cancels a superseded read", async () => {
    const client = createProxyCaller<ReturnType<typeof api>>("orders", { source: api() });

    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ method: "GET", body: "" });
  });
});
