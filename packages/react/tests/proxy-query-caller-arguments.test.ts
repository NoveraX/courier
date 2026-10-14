/**
 * What a proxy query client is created from: the routes of its API, which
 * name the endpoints its hooks reach and how each is reached — streams and
 * channels included, which open as subscriptions and sockets.
 */
import {
  type CourierRoutes,
  courier,
  defineApi,
  defineGroup,
  type RouteMap,
} from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { liveApi } from "./helpers/live-api";

const { endpoint } = courier();

describe("createProxyQueryCaller for an API with streams and channels", () => {
  it("has the hooks that open them, from its routes alone", () => {
    const q = createProxyQueryCaller(routesOf(liveApi, "api"), {
      proxyPath: { ws: "wss://realtime.example.com" },
    });
    /* Hooks run inside a component only; the compiler is what is asked here. */
    function useHooks(): void {
      q.live.useSubscription("ticks", { variables: { n: 3 } });
      q.live.useChannel("room", { variables: { room: "lobby" } });
    }

    expect(useHooks).toBeTypeOf("function");
    expect(q.live).toBeTypeOf("object");
  });
});

/**
 * A query caller given the routes of an API has the hooks of the endpoints
 * they name alone, and sends a read as GET only where they say it may be
 * cached — every other read as POST, its variables kept out of the address.
 */
describe("createProxyQueryCaller given routes", () => {
  const shop = defineApi({
    name: "shop",
    baseURL: "https://example.com",
    groups: {
      users: defineGroup({
        prefix: "/users",
        endpoints: {
          list: endpoint.get("").response<string[]>().cache({ revalidate: 60 }),
          search: endpoint.get("search").variables<{ q: string }>().response<string[]>(),
          purge: endpoint.del(""),
        },
      }),
    },
  });
  const endpoints = {
    "users.list": { type: "query", get: true },
    "users.search": { type: "query" },
  } as const satisfies RouteMap<typeof shop>;
  const routes: CourierRoutes<typeof shop, typeof endpoints> = { source: "shop", endpoints };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has hooks for the endpoints the routes name alone", () => {
    const q = createProxyQueryCaller(routes);
    function useHooks(): void {
      q.users.useQuery("list");
      q.users.useQuery("search", { variables: { q: "ada" } });
      // @ts-expect-error — the routes do not name users.purge
      q.users.useMutation("purge");
    }

    expect(useHooks).toBeTypeOf("function");
  });

  it("sends a read the routes mark as cacheable as GET, and any other read as POST", async () => {
    const fetchSpy = vi.fn(
      async () => new Response("[]", { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const q = createProxyQueryCaller(routes, {
      proxyPath: { http: "http://app.example/api/request" },
    });
    const queryClient = new QueryClient();

    await q.users.prefetchQuery(queryClient, "list");
    await q.users.prefetchQuery(queryClient, "search", { variables: { q: "ada" } });

    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "POST"]);
    expect(calls[1]?.[0]).not.toContain("ada");
  });
});
