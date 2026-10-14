/**
 * @vitest-environment jsdom
 *
 * A query caller of groups inside groups: each group's hooks, and the groups
 * inside it under their names — directly and by name alone — keyed one
 * element per group, so invalidating an outer group invalidates the queries
 * of every group inside it.
 */

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { createQueryCaller } from "../src/create-query-caller";
import { createQueryKeys } from "../src/keys";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "https://api.example.com",
  name: "shop",
  expose: true,
  groups: {
    billing: defineGroup({
      prefix: "billing",
      endpoints: { summary: endpoint.get("summary").response<{ total: number }>() },
      groups: {
        invoices: defineGroup({
          prefix: "invoices",
          endpoints: { list: endpoint.get("").response<{ id: string }[]>() },
        }),
      },
    }),
  },
});

let fetchSpy: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  fetchSpy = vi.fn(async () => Response.json([{ id: "i1" }]));
  vi.stubGlobal("fetch", fetchSpy);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("a query caller of groups inside groups", () => {
  it("queries a group inside a group at the address its prefixes make", async () => {
    const q = createQueryCaller(api);

    const { result } = renderHook(() => q.billing.invoices.useQuery("list"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "i1" }]);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://api.example.com/billing/invoices");
    expectTypeOf(result.current.data).toEqualTypeOf<{ id: string }[] | undefined>();
  });

  it("keeps the outer group's own hooks beside the groups inside it", () => {
    const q = createQueryCaller(api);

    expect(Object.keys(q.billing)).toContain("invoices");
    expect(typeof q.billing.useQuery).toBe("function");
    expect(q.billing.invoices).toBe(q.billing.invoices);
  });

  it("reaches a group inside a group through the proxy, by the routes' whole path", async () => {
    const q = createProxyQueryCaller(routesOf(api, "shop"), {
      proxyPath: { http: "https://app.example.com/api/request" },
    });

    const { result } = renderHook(() => q.billing.invoices.useQuery("list"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect([url.searchParams.get("_g"), url.searchParams.get("_m")]).toEqual([
      "billing.invoices",
      "list",
    ]);
  });

  it("keys a group's queries one element per group, so the outer group's key invalidates them", async () => {
    const q = createQueryCaller(api);
    const keys = createQueryKeys(api);
    const { result } = renderHook(() => q.billing.invoices.useQuery("list"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await queryClient.invalidateQueries({ queryKey: keys("billing") });

    expect(keys("billing.invoices", "list")).toEqual(["shop", "billing", "invoices", "list"]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
