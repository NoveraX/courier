/**
 * Values an endpoint sends for variables a call leaves out, from
 * `.defaults()`: a defaulted variable becomes optional for the caller, the
 * caller's own value wins, and they are filled in where the call is made —
 * on the server for a browser's call through the proxy — before the
 * variables are validated. A default that is no data a request can carry is
 * refused where the endpoint is defined.
 */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import type { InferVariables } from "../src/define/index";
import { courier, defineApi } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;

let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function news() {
  return defineApi({
    name: "site",
    baseURL: upstream.url,
    endpoints: {
      byGroup: endpoint
        .get("news")
        .variables<{ group: string; groupBy: "year" | "month"; page?: number }>()
        .defaults({ groupBy: "year" }),
      search: endpoint
        .post("search")
        .variables(z.object({ q: z.string(), size: z.number().int().max(50) }))
        .defaults({ size: 20 }),
      latest: endpoint.get("latest").variables<{ limit: number }>().defaults({ limit: 5 }),
    },
  });
}

describe("a defaulted variable", () => {
  it("is optional for the caller, the others as they were", () => {
    const api = news();

    expectTypeOf<InferVariables<typeof api.byGroup>>().toEqualTypeOf<{
      group: string;
      page?: number;
      groupBy?: "year" | "month";
    }>();
    const typeOnly = () => {
      const caller = createCaller(api);
      void caller.latest();
      void caller.byGroup({ group: "press" });
      // @ts-expect-error — a variable without a default is still required
      void caller.byGroup({});
    };
    expect(typeOnly).toBeTypeOf("function");
  });

  it("names only variables the endpoint has", () => {
    const typeOnly = () =>
      endpoint
        .get("news")
        .variables<{ groupBy: string }>()
        // @ts-expect-error — no such variable
        .defaults({ groupby: "year" });
    expect(typeOnly).toBeTypeOf("function");
  });

  it("is sent when the call leaves it out, and the call's own value wins", async () => {
    const caller = createCaller(news());

    await caller.byGroup({ group: "press" });
    await caller.byGroup({ group: "press", groupBy: "month" });
    await caller.latest();

    expect(upstream.received.map(({ url }) => url)).toEqual([
      "/news?group=press&groupBy=year",
      "/news?group=press&groupBy=month",
      "/latest?limit=5",
    ]);
  });

  it("is filled in before the variables are validated", async () => {
    const caller = createCaller(news());

    await caller.search({ q: "lamp" });
    await expect(caller.search({ q: "lamp", size: 500 })).rejects.toMatchObject({
      name: "ValidationError",
    });

    expect(upstream.received.map(({ body }) => JSON.parse(body.toString()))).toEqual([
      { q: "lamp", size: 20 },
    ]);
  });

  it("is filled in on the server for a browser's call through the proxy", async () => {
    vi.stubGlobal("document", {});
    registerSources({ site: news() });
    const handler = createHandler();
    const proxied = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
    });
    vi.stubGlobal("fetch", proxied);
    const site = createProxyCaller<ReturnType<typeof news>>("site");

    await site.byGroup({ group: "press" });

    const toProxy = String(proxied.mock.calls[0]?.[0]);
    expect(toProxy).not.toContain("groupBy");
    expect(upstream.received.map(({ url }) => url)).toEqual(["/news?group=press&groupBy=year"]);
  });
});

describe(".defaults()", () => {
  it("refuses what no request can carry", () => {
    const base = endpoint.get("news").variables<{ when: unknown; groupBy: string }>();

    expect(() => base.defaults({ when: new Date() } as never)).toThrow(
      expect.objectContaining({ code: "DEFAULTS_INVALID" }),
    );
    expect(() => base.defaults({ groupBy: undefined } as never)).toThrow(/groupBy/);
    expect(() => base.defaults("year" as never)).toThrow(/takes an object/);
  });

  it("adds to the defaults named before", async () => {
    const caller = createCaller(
      defineApi({
        name: "site",
        baseURL: upstream.url,
        endpoints: {
          list: endpoint
            .get("items")
            .variables<{ page: number; size: number }>()
            .defaults({ page: 1 })
            .defaults({ size: 10 }),
        },
      }),
    );

    await caller.list();

    expect(upstream.received.map(({ url }) => url)).toEqual(["/items?page=1&size=10"]);
  });
});
