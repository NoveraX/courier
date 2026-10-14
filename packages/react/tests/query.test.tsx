/**
 * @vitest-environment jsdom
 */

import type { CourierRoutes, HttpEndpoint, RouteMap } from "@noverax/courier/define";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProxyQueryCaller, optimisticOptions } from "../src/index";
import { createProxyQueryKeys } from "../src/keys";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

type TestApi = {
  options: {
    groups: {
      users: {
        options: { prefix?: string };
        getAll: HttpEndpoint<{ id: number; name: string }[], void, "query">;
        getById: HttpEndpoint<{ id: number; name: string }, { id: number }, "query">;
        create: HttpEndpoint<{ id: number; name: string }, { name: string }, "query">;
        list: HttpEndpoint<
          { items: { id: number }[]; nextCursor: number | null },
          { cursor: number },
          "query"
        >;
      };
      cache: {
        options: { prefix?: string };
        clear: HttpEndpoint<{ ok: boolean }, void, "query">;
      };
    };
  };
};

/* The routes these tests' clients take: every endpoint of TestApi, each a read, as its type says. */
const endpoints = {
  "cache.clear": { type: "query" },
  "users.create": { type: "query" },
  "users.getAll": { type: "query" },
  "users.getById": { type: "query" },
  "users.list": { type: "query" },
} as const satisfies RouteMap<TestApi>;
const routes: CourierRoutes<TestApi, typeof endpoints> = { source: "api", endpoints };

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function suspenseWrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(Suspense, { fallback: createElement("div", null, "Loading") }, children),
  );
}

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse({}));
  vi.stubGlobal("fetch", fetchSpy);
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

function getFetchBody(index = 0) {
  const body = fetchSpy.mock.calls[index]?.[1]?.body;
  return body ? JSON.parse(body as string) : undefined;
}

// ---------------------------------------------------------------------------
// createProxyQueryCaller — basic
// ---------------------------------------------------------------------------

describe("createProxyQueryCaller", () => {
  it("returns a proxy with group access", () => {
    const q = createProxyQueryCaller(routes);
    expect(typeof q).toBe("object");
    expect(typeof (q as any).users).toBe("object");
  });

  it("group exposes all hooks", () => {
    const q = createProxyQueryCaller(routes);
    const users = (q as any).users;
    expect(typeof users.useQuery).toBe("function");
    expect(typeof users.useSuspenseQuery).toBe("function");
    expect(typeof users.useInfiniteQuery).toBe("function");
    expect(typeof users.useMutation).toBe("function");
    expect(typeof users.prefetchQuery).toBe("function");
  });

  it("supports destructuring from group", () => {
    const q = createProxyQueryCaller(routes);
    const { useQuery: uq, useMutation: um } = (q as any).users;
    expect(typeof uq).toBe("function");
    expect(typeof um).toBe("function");
  });

  it("does not trigger thenable detection", async () => {
    const q = createProxyQueryCaller(routes);
    const result = await Promise.resolve(q);
    expect(result).toBe(q);
  });
});

// ---------------------------------------------------------------------------
// useQuery
// ---------------------------------------------------------------------------

describe("useQuery", () => {
  it("fetches data and returns result", async () => {
    const users = [{ id: 1, name: "Alice" }];
    fetchSpy.mockResolvedValue(mockFetchResponse(users));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(users);
  });

  it("passes variables to the request", async () => {
    const user = { id: 1, name: "Alice" };
    fetchSpy.mockResolvedValue(mockFetchResponse(user));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(
      () => (q as any).users.useQuery("getById", { variables: { id: 1 } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = getFetchBody();
    expect(body?.variables).toEqual({ id: 1 });
  });

  it("builds query key without variables when undefined", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const q = createProxyQueryCaller(routes);
    renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    expect(cache[0]?.queryKey).toEqual(["api", "users", "getAll"]);
  });

  it("builds query key with variables when provided", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({}));

    const q = createProxyQueryCaller(routes);
    renderHook(() => (q as any).users.useQuery("getById", { variables: { id: 5 } }), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    expect(cache[0]?.queryKey).toEqual(["api", "users", "getById", { id: 5 }]);
  });

  it("forwards extra query options (enabled: false)", () => {
    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useQuery("getAll", { enabled: false }), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles fetch errors", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    /* A failure to reach the proxy is an HTTPError with status 0, the original as its cause. */
    expect(result.current.error?.status).toBe(0);
    expect(result.current.error?.cause).toMatchObject({ message: "Network error" });
  });

  it("works with destructured useQuery", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1 }]));

    const q = createProxyQueryCaller(routes);
    const { useQuery } = (q as any).users;
    const { result } = renderHook(() => useQuery("getAll"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// useSuspenseQuery
// ---------------------------------------------------------------------------

describe("useSuspenseQuery", () => {
  it("fetches data with suspense", async () => {
    const users = [{ id: 1, name: "Alice" }];
    fetchSpy.mockResolvedValue(mockFetchResponse(users));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useSuspenseQuery("getAll"), {
      wrapper: suspenseWrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(users));
  });

  it("passes variables in suspense mode", async () => {
    const user = { id: 1, name: "Alice" };
    fetchSpy.mockResolvedValue(mockFetchResponse(user));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(
      () => (q as any).users.useSuspenseQuery("getById", { variables: { id: 1 } }),
      { wrapper: suspenseWrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(user));

    const body = getFetchBody();
    expect(body?.variables).toEqual({ id: 1 });
  });

  it("builds correct query key", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const q = createProxyQueryCaller(routes);
    renderHook(() => (q as any).users.useSuspenseQuery("getAll"), { wrapper: suspenseWrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    expect(cache[0]?.queryKey).toEqual(["api", "users", "getAll"]);
  });
});

// ---------------------------------------------------------------------------
// useInfiniteQuery
// ---------------------------------------------------------------------------

describe("useInfiniteQuery", () => {
  it("fetches first page", async () => {
    const page1 = { items: [{ id: 1 }], nextCursor: 2 };
    fetchSpy.mockResolvedValue(mockFetchResponse(page1));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(
      () =>
        (q as any).users.useInfiniteQuery("list", {
          initialPageParam: 0,
          getNextPageParam: (lastPage: any) => lastPage.nextCursor,
          variables: (pageParam: number) => ({ cursor: pageParam }),
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]).toEqual(page1);
  });

  it("passes page param as variables", async () => {
    const page1 = { items: [{ id: 1 }], nextCursor: 2 };
    fetchSpy.mockResolvedValue(mockFetchResponse(page1));

    const q = createProxyQueryCaller(routes);
    renderHook(
      () =>
        (q as any).users.useInfiniteQuery("list", {
          initialPageParam: 0,
          getNextPageParam: (lastPage: any) => lastPage.nextCursor,
          variables: (pageParam: number) => ({ cursor: pageParam }),
        }),
      { wrapper },
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const body = getFetchBody();
    expect(body?.variables).toEqual({ cursor: 0 });
  });

  it("fetches next page", async () => {
    const page1 = { items: [{ id: 1 }], nextCursor: 2 };
    const page2 = { items: [{ id: 2 }], nextCursor: null };
    fetchSpy
      .mockResolvedValueOnce(mockFetchResponse(page1))
      .mockResolvedValueOnce(mockFetchResponse(page2));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(
      () =>
        (q as any).users.useInfiniteQuery("list", {
          initialPageParam: 0,
          getNextPageParam: (lastPage: any) => lastPage.nextCursor,
          variables: (pageParam: number) => ({ cursor: pageParam }),
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1]).toEqual(page2);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("keys the list by its first page's variables", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({ items: [], nextCursor: null }));

    const q = createProxyQueryCaller(routes);
    renderHook(
      () =>
        (q as any).users.useInfiniteQuery("list", {
          initialPageParam: 0,
          getNextPageParam: (lastPage: any) => lastPage.nextCursor,
          variables: (pageParam: number) => ({ cursor: pageParam }),
        }),
      { wrapper },
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    expect(cache[0]?.queryKey).toEqual(["api", "users", "list", { cursor: 0 }, "infinite"]);
  });
});

// ---------------------------------------------------------------------------
// useMutation
// ---------------------------------------------------------------------------

describe("useMutation", () => {
  it("performs mutation and returns data", async () => {
    const created = { id: 1, name: "Alice" };
    fetchSpy.mockResolvedValue(mockFetchResponse(created));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useMutation("create"), { wrapper });

    result.current.mutate({ name: "Alice" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(created);
  });

  it("passes variables to mutationFn", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useMutation("create"), { wrapper });

    result.current.mutate({ name: "Bob" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = getFetchBody();
    expect(body?.variables).toEqual({ name: "Bob" });
  });

  it("calls onSuccess callback", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));
    const onSuccess = vi.fn();

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useMutation("create", { onSuccess }), {
      wrapper,
    });

    result.current.mutate({ name: "Alice" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalled();
    expect(onSuccess.mock.calls[0]?.[0]).toEqual({ id: 1 });
  });

  it("handles mutation errors", async () => {
    fetchSpy.mockRejectedValue(new Error("Server error"));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).users.useMutation("create"), { wrapper });

    result.current.mutate({ name: "Alice" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(0);
    expect(result.current.error?.cause).toMatchObject({ message: "Server error" });
  });

  it("mutates without variables for void endpoints", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(() => (q as any).cache.useMutation("clear"), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("auto-invalidates queries on mutation success", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    fetchSpy.mockResolvedValue(mockFetchResponse({ id: 2, name: "New" }));

    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(
      () =>
        (q as any).users.useMutation("create", {
          invalidate: [["api", "users", "getAll"]],
        }),
      { wrapper },
    );

    result.current.mutate({ name: "New" });

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["api", "users", "getAll"] }));
  });

  it("calls user onSettled alongside auto-invalidation", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

    const onSettled = vi.fn();
    const q = createProxyQueryCaller(routes);
    const { result } = renderHook(
      () =>
        (q as any).users.useMutation("create", {
          invalidate: [["api", "users", "getAll"]],
          onSettled,
        }),
      { wrapper },
    );

    result.current.mutate({ name: "Alice" });

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith({ queryKey: ["api", "users", "getAll"] });
    });
  });
});

// ---------------------------------------------------------------------------
// prefetchQuery
// ---------------------------------------------------------------------------

describe("prefetchQuery", () => {
  it("prefetches and populates query cache", async () => {
    const users = [{ id: 1, name: "Alice" }];
    fetchSpy.mockResolvedValue(mockFetchResponse(users));

    const q = createProxyQueryCaller(routes);
    await (q as any).users.prefetchQuery(queryClient, "getAll");

    const cached = queryClient.getQueryData(["api", "users", "getAll"]);
    expect(cached).toEqual(users);
  });

  it("prefetches with variables", async () => {
    const user = { id: 1, name: "Alice" };
    fetchSpy.mockResolvedValue(mockFetchResponse(user));

    const q = createProxyQueryCaller(routes);
    await (q as any).users.prefetchQuery(queryClient, "getById", { variables: { id: 1 } });

    const cached = queryClient.getQueryData(["api", "users", "getById", { id: 1 }]);
    expect(cached).toEqual(user);
  });

  it("respects staleTime option", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const q = createProxyQueryCaller(routes);
    await (q as any).users.prefetchQuery(queryClient, "getAll", { staleTime: 60_000 });

    const state = queryClient.getQueryState(["api", "users", "getAll"]);
    expect(state?.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// optimisticOptions
// ---------------------------------------------------------------------------

describe("optimisticOptions", () => {
  it("sets optimistic data on mutate", async () => {
    queryClient.setQueryData(["api", "users", "getAll"], [{ id: 1, name: "Alice" }]);

    const opts = optimisticOptions<{ id: number; name: string }[], { name: string }>(queryClient, {
      queryKey: ["api", "users", "getAll"],
      updater: (old, vars) => [...(old ?? []), { id: 999, name: vars.name }],
    });

    await opts.onMutate({ name: "Bob" });

    const cached = queryClient.getQueryData<{ id: number; name: string }[]>([
      "api",
      "users",
      "getAll",
    ]);
    expect(cached).toEqual([
      { id: 1, name: "Alice" },
      { id: 999, name: "Bob" },
    ]);
  });

  it("rolls back on error", async () => {
    const original = [{ id: 1, name: "Alice" }];
    queryClient.setQueryData(["api", "users", "getAll"], original);

    const opts = optimisticOptions<{ id: number; name: string }[], { name: string }>(queryClient, {
      queryKey: ["api", "users", "getAll"],
      updater: (old, vars) => [...(old ?? []), { id: 999, name: vars.name }],
    });

    const context = await opts.onMutate({ name: "Bob" });
    opts.onError(new Error("fail") as any, { name: "Bob" }, context);

    const cached = queryClient.getQueryData(["api", "users", "getAll"]);
    expect(cached).toEqual(original);
  });

  it("invalidates on settled", async () => {
    queryClient.setQueryData(["api", "users", "getAll"], []);

    const opts = optimisticOptions<{ id: number; name: string }[], { name: string }>(queryClient, {
      queryKey: ["api", "users", "getAll"],
      updater: (old, vars) => [...(old ?? []), { id: 1, name: vars.name }],
    });

    await opts.onMutate({ name: "Alice" });
    opts.onSettled();

    const state = queryClient.getQueryState(["api", "users", "getAll"]);
    expect(state?.isInvalidated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createProxyQueryKeys
// ---------------------------------------------------------------------------

describe("createProxyQueryKeys", () => {
  it("creates group-level key", () => {
    const key = createProxyQueryKeys(routes);
    expect(key("users")).toEqual(["api", "users"]);
  });

  it("creates method-level key", () => {
    const key = createProxyQueryKeys(routes);
    expect(key("users", "getAll")).toEqual(["api", "users", "getAll"]);
  });

  it("creates key with variables", () => {
    const key = createProxyQueryKeys(routes);
    expect(key("users", "getById", { id: 1 })).toEqual(["api", "users", "getById", { id: 1 }]);
  });

  it("keys match query cache keys", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));
    const key = createProxyQueryKeys(routes);

    const q = createProxyQueryCaller(routes);
    renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cached = queryClient.getQueryData(key("users", "getAll"));
    expect(cached).toEqual([]);
  });
});
