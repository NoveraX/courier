/**
 * Groups inside groups, to any depth. A group holds groups as a source does,
 * under `options.groups`; a client reaches one by its names in turn, and its
 * address joins every group's prefix in order. Every assertion on a request
 * is on what a real upstream received, directly and through the proxy.
 */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import { isExposedToWire } from "../src/adapter/exposure";
import { createCaller } from "../src/caller";
import { shapeOfSource } from "../src/client/shape";
import { defineBoundary } from "../src/define/boundary";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import { sourceFromBoundary } from "../src/proxy-caller/from-boundary";
import { parseWSTopic } from "../src/realtime/ws-address";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { createTestClient } from "../src/testing/create-test-client";
import { streamRequest } from "../src/transport/direct/stream-request";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";

const { endpoint, stream } = courier();
type Invoice = { id: string };

let upstream: EchoServer;

function api(baseURL = upstream.origin) {
  return defineApi({
    expose: true,
    name: "shop",
    baseURL,
    groups: {
      billing: defineGroup({
        prefix: "/billing/",
        endpoints: {
          summary: endpoint.get("summary").response<{ total: number }>(),
          invoices: endpoint.get("invoices-legacy").response<unknown>(),
        },
        groups: {
          invoices: defineGroup({
            prefix: "invoices",
            endpoints: {
              list: endpoint.get("").response<Invoice[]>(),
              byId: endpoint.get(":id").variables<{ id: string }>().response<Invoice>(),
              watch: stream.response<{ n: number }>().get("watch"),
            },
            groups: {
              lines: defineGroup({
                prefix: ":invoice/lines",
                endpoints: { list: endpoint.get("").variables<{ invoice: string }>() },
              }),
            },
          }),
        },
      }),
    },
  });
}

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

describe("a group inside a group", () => {
  it("is kept under its outer group's options, as a source keeps its groups", () => {
    const billing = api().options.groups.billing;

    expect(Object.keys(billing.options.groups)).toEqual(["invoices"]);
    expect(billing.options.prefix).toBe("/billing/");
  });

  it("is reached by its names in turn, its address every group's prefix in order", async () => {
    const client = createCaller(api());

    await client.billing.invoices.list();
    await client.billing.invoices.byId({ id: "i7" });
    await client.billing.invoices.lines.list({ invoice: "i7" });

    expect(upstream.received.map((r) => r.url)).toEqual([
      "/billing/invoices",
      "/billing/invoices/i7",
      "/billing/invoices/i7/lines",
    ]);
  });

  it("leaves its outer group's own endpoints, one sharing its name included, where they were", async () => {
    const client = createCaller(api());

    await client.billing.summary();
    await client.billing.invoices();

    expect(upstream.received.map((r) => r.url)).toEqual([
      "/billing/summary",
      "/billing/invoices-legacy",
    ]);
  });

  it("is typed at every depth", () => {
    const client = createCaller(api());

    expectTypeOf(client.billing.invoices.list).returns.toEqualTypeOf<Promise<{ id: string }[]>>();
    expectTypeOf(client.billing.invoices.lines.list)
      .parameter(0)
      .toEqualTypeOf<{ invoice: string }>();
  });

  it("opens a stream at the address its groups' prefixes make", () => {
    const { url } = streamRequest(api("https://api.example/v1"), "billing.invoices", "watch", {});

    expect(url).toBe("https://api.example/v1/billing/invoices/watch");
  });
});

describe("a group inside a group, through the proxy", () => {
  let proxy: ProxyServer;

  beforeEach(async () => {
    registerSources({ shop: api() });
    proxy = await startProxyServer();
  });

  afterEach(async () => {
    await proxy.close();
  });

  it("is reached by a client that has the source", async () => {
    const client = createProxyCaller<ReturnType<typeof api>>("shop", {
      source: api(),
      proxyPath: { http: proxy.url },
    });

    await client.billing.invoices.lines.list({ invoice: "i9" });

    expect(upstream.last().url).toBe("/billing/invoices/i9/lines");
  });

  it("is reached by a client that knows only the source's name, by the chain of names", async () => {
    const client = createProxyCaller("shop", { proxyPath: { http: proxy.url } }) as unknown as {
      billing: { invoices: { byId: (variables: { id: string }) => Promise<unknown> } };
    };

    await client.billing.invoices.byId({ id: "i3" });

    expect(upstream.last().url).toBe("/billing/invoices/i3");
  });
});

describe("what decides whether the browser reaches a group inside a group", () => {
  const source = defineApi({
    baseURL: "https://api.example",
    expose: false,
    groups: {
      admin: defineGroup({
        expose: false,
        endpoints: { purge: endpoint.del("purge") },
        groups: {
          reports: defineGroup({ expose: true, endpoints: { daily: endpoint.get("daily") } }),
          audit: defineGroup({ endpoints: { log: endpoint.get("log") } }),
        },
      }),
    },
  });

  it("is the nearest group that says", () => {
    expect(isExposedToWire(source, "admin.reports", "daily")).toBe(true);
    expect(isExposedToWire(source, "admin.audit", "log")).toBe(false);
    expect(isExposedToWire(source, "admin", "purge")).toBe(false);
  });

  it("is a boundary that names the endpoint by its whole path", () => {
    const boundary = defineBoundary({
      source: "api",
      expose: { "admin.reports.daily": "query" },
    });

    const shape = shapeOfSource(sourceFromBoundary(boundary));

    expect([...(shape?.groups.get("admin")?.groups.get("reports")?.endpoints ?? [])]).toEqual([
      "daily",
    ]);
    expect(shape?.groups.get("admin")?.endpoints.size).toBe(0);
  });
});

describe("a name that holds a dot", () => {
  it("is refused for an endpoint and for a group, the dot separating paths", () => {
    expect(() => defineGroup({ endpoints: { "invoices.list": endpoint.get("") } })).toThrow(
      expect.objectContaining({ code: "DOTTED_NAME" }),
    );
    expect(() =>
      defineApi({
        expose: true,
        baseURL: "https://api.example",
        groups: { "billing.v2": defineGroup({ endpoints: {} }) },
      }),
    ).toThrow(expect.objectContaining({ code: "DOTTED_NAME" }));
  });
});

describe("a topic of a channel inside a group inside a group", () => {
  it("is read back to its source, its group's path and its endpoint", () => {
    expect(parseWSTopic("shop.billing.invoices.room")).toEqual({
      source: "shop",
      group: "billing.invoices",
      method: "room",
    });
    expect(parseWSTopic("shop.room")).toEqual({ source: "shop", group: "", method: "room" });
    expect(parseWSTopic("shop")).toBeUndefined();
  });
});

describe("a test client of nested groups", () => {
  it("mocks an endpoint by its group's path", async () => {
    const test = createTestClient<ReturnType<typeof api>>();
    test.mock("billing.invoices", "list").resolves([{ id: "i1" }]);

    await expect(test.client.billing.invoices.list()).resolves.toEqual([{ id: "i1" }]);
    expect(test.history.map((h) => [h.group, h.method])).toEqual([["billing.invoices", "list"]]);
  });
});
