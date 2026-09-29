import { courier, defineApi, defineBoundary, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { liveApi } from "./helpers/live-api";

const { endpoint } = courier();

const httpOnlyApi = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: { list: endpoint.get("").response<string[]>() },
    }),
  },
});

const boundary = defineBoundary({
  source: "api",
  expose: { "live.ticks": "stream", "live.room": "duplex" },
  proxyPath: { ws: "wss://realtime.example.com" },
});

/**
 * A proxy query caller for an API with streams or channels asks for the
 * boundary those hooks reach, as `createProxyCaller` does: without one, a
 * channel has no WebSocket path to open and fails the first time it is used.
 */
describe("createProxyQueryCaller arguments", () => {
  it("needs nothing more for an API of plain requests", () => {
    expect(createProxyQueryCaller<typeof httpOnlyApi>("api")).toBeTypeOf("object");
  });

  it("takes a boundary or the source for an API with streams and channels", () => {
    expect(createProxyQueryCaller<typeof liveApi>("api", { boundary })).toBeTypeOf("object");
    expect(createProxyQueryCaller<typeof liveApi>("api", { source: liveApi })).toBeTypeOf("object");
  });

  it("refuses an API with streams and channels without either", () => {
    function useRefused(): void {
      // @ts-expect-error — the hooks of liveApi need a boundary or the source
      createProxyQueryCaller<typeof liveApi>("api", { proxyPath: { http: "/api/request" } });
      // @ts-expect-error — the hooks of liveApi need a boundary or the source
      createProxyQueryCaller<typeof liveApi>("api");
    }

    expect(useRefused).toBeTypeOf("function");
  });
});

/**
 * A query caller for an API that holds a boundary has the hooks of the
 * endpoints the boundary names alone: the rest are refused by the proxy, and
 * their hooks compiled as though they would answer.
 */
describe("createProxyQueryCaller for an API that holds a boundary", () => {
  it("has hooks for the endpoints the boundary names alone", () => {
    const gated = defineApi({
      name: "shop",
      baseURL: "https://example.com",
      boundary: defineBoundary({ source: "shop", expose: { "users.list": "query" } }),
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: { list: endpoint.get("").response<string[]>(), purge: endpoint.del("") },
        }),
        admin: defineGroup({ prefix: "/admin", endpoints: { stats: endpoint.get("stats") } }),
      },
    });

    const q = createProxyQueryCaller<typeof gated>("shop");
    /* Hooks run inside a component only; the compiler is what is asked here. */
    function useHooks(): void {
      q.users.useQuery("list");
      // @ts-expect-error — the boundary does not name users.purge
      q.users.useMutation("purge");
      // @ts-expect-error — nor anything of admin
      q.admin.useQuery("stats");
    }

    expect(useHooks).toBeTypeOf("function");
    expect(q.users).toBeTypeOf("object");
  });
});

describe("createProxyQueryCaller given the API as its source", () => {
  it("is typed from it without a type argument", () => {
    const typeOnly = () => {
      const q = createProxyQueryCaller("api", { source: httpOnlyApi });
      q.users.useQuery("list");
      // @ts-expect-error — the API has no such group
      q.orders.useQuery("list");
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});
