/**
 * @vitest-environment jsdom
 */

import { Suspense, type ReactNode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

import { defineApi, defineGroup, endpoint } from "@noverax/courier/define";
import { createQueryCaller } from "../src/create-query-caller";
import { createQueryKeys } from "../src/keys";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

// Real api fixture using defineApi (direct mode requires actual endpoint functions)
const usersGroup = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint<{ id: number; name: string }[]>()((http) => http.get()),
    getById: endpoint<{ id: number; name: string }, { id: number }>()((http, vars) =>
      http.get(`${vars.id}`),
    ),
    create: endpoint<{ id: number; name: string }, { name: string }>()((http, vars) =>
      http.post("", vars),
    ),
  },
});

const postsGroup = defineGroup({
  prefix: "posts",
  endpoints: {
    list: endpoint<{ id: number; title: string }[]>()((http) => http.get()),
  },
});

const api = defineApi({
  baseURL: "https://api.example.com",
  name: "demo",
  groups: { users: usersGroup, posts: postsGroup },
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
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

// ---------------------------------------------------------------------------
// createQueryCaller (direct mode)
// ---------------------------------------------------------------------------

describe("createQueryCaller (direct mode)", () => {
  it("returns a proxy with group access", () => {
    const q = createQueryCaller(api);
    expect(typeof q).toBe("object");
    expect(typeof (q as any).users).toBe("object");
  });

  it("group exposes all hooks", () => {
    const q = createQueryCaller(api);
    const users = (q as any).users;
    expect(typeof users.useQuery).toBe("function");
    expect(typeof users.useSuspenseQuery).toBe("function");
    expect(typeof users.useInfiniteQuery).toBe("function");
    expect(typeof users.useMutation).toBe("function");
    expect(typeof users.prefetchQuery).toBe("function");
    expect(typeof users.useSubscription).toBe("function");
    expect(typeof users.useChannel).toBe("function");
  });

  it("supports destructuring from group", () => {
    const q = createQueryCaller(api);
    const { useQuery: uq, useMutation: um } = (q as any).users;
    expect(typeof uq).toBe("function");
    expect(typeof um).toBe("function");
  });

  it("does not trigger thenable detection", async () => {
    const q = createQueryCaller(api);
    const result = await Promise.resolve(q);
    expect(result).toBe(q);
  });

  it("calls backend directly via baseURL (not proxy endpoint)", async () => {
    const users = [{ id: 1, name: "Alice" }];
    fetchSpy.mockResolvedValue(mockFetchResponse(users));

    const q = createQueryCaller(api);
    const { result } = renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(users);

    // Direct mode hits the backend URL directly, NOT /api/request
    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("https://api.example.com");
    expect(calledUrl).not.toContain("/api/request");
  });

  it("passes path variables in URL for direct mode", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({ id: 5, name: "Eve" }));

    const q = createQueryCaller(api);
    const { result } = renderHook(
      () => (q as any).users.useQuery("getById", { variables: { id: 5 } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("/users/5");
  });

  it("uses source name from getSourceName for query keys", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const q = createQueryCaller(api);
    renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    // Source name comes from defineApi({ name: "demo" })
    expect(cache[0]?.queryKey).toEqual(["demo", "users", "getAll"]);
  });

  it("includes variables in query key when provided", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({}));

    const q = createQueryCaller(api);
    renderHook(() => (q as any).users.useQuery("getById", { variables: { id: 7 } }), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache[0]?.queryKey).toEqual(["demo", "users", "getById", { id: 7 }]);
  });

  it("supports useMutation for direct calls", async () => {
    const created = { id: 99, name: "Mallory" };
    fetchSpy.mockResolvedValue(mockFetchResponse(created));

    const q = createQueryCaller(api);
    const { result } = renderHook(() => (q as any).users.useMutation("create"), { wrapper });

    result.current.mutate({ name: "Mallory" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(created);
  });

  it("forwards default headers from QueryCallerDefaults", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const q = createQueryCaller(api, { headers: { Authorization: "Bearer token-123" } });
    renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("respects enabled: false (skips fetch)", () => {
    const q = createQueryCaller(api);
    const { result } = renderHook(
      () => (q as any).users.useQuery("getAll", { enabled: false }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates fetch errors to react-query", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Bad gateway", { status: 502, statusText: "Bad Gateway" }),
    );

    const q = createQueryCaller(api);
    const { result } = renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("502");
  });

  it("supports useSuspenseQuery — fetches and resolves data", async () => {
    const users = [{ id: 1, name: "Alice" }];
    fetchSpy.mockResolvedValue(mockFetchResponse(users));

    const q = createQueryCaller(api);
    const { result } = renderHook(
      () => (q as any).users.useSuspenseQuery("getAll"),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(Suspense, { fallback: null }, children),
          ),
      },
    );

    await waitFor(() => expect(result.current?.data).toEqual(users));
  });

  it("supports useInfiniteQuery — paginated fetch with getNextPageParam", async () => {
    const page1 = [{ id: 1, name: "A" }];
    const page2 = [{ id: 2, name: "B" }];
    fetchSpy
      .mockResolvedValueOnce(mockFetchResponse(page1))
      .mockResolvedValueOnce(mockFetchResponse(page2));

    const q = createQueryCaller(api);
    const { result } = renderHook(
      () =>
        (q as any).users.useInfiniteQuery("getAll", {
          initialPageParam: 0,
          getNextPageParam: (_last: unknown, _all: unknown[], lastPageParam: number) =>
            lastPageParam < 1 ? lastPageParam + 1 : undefined,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toEqual([page1]);
    expect(result.current.hasNextPage).toBe(true);

    result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages).toEqual([page1, page2]);
  });

  it("isolates query caches across multiple createQueryCaller instances with different sources", async () => {
    const apiA = defineApi({
      baseURL: "https://a.example.com",
      name: "alpha",
      groups: { users: usersGroup },
    });
    const apiB = defineApi({
      baseURL: "https://b.example.com",
      name: "beta",
      groups: { users: usersGroup },
    });

    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const qA = createQueryCaller(apiA);
    const qB = createQueryCaller(apiB);

    renderHook(() => (qA as any).users.useQuery("getAll"), { wrapper });
    renderHook(() => (qB as any).users.useQuery("getAll"), { wrapper });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const cache = queryClient.getQueryCache().getAll();
    const sources = cache.map((c) => c.queryKey[0]).sort();
    expect(sources).toEqual(["alpha", "beta"]);

    // URLs are different — no cache leakage
    const urls = fetchSpy.mock.calls.map((call) => call[0] as string).sort();
    expect(urls[0]).toContain("a.example.com");
    expect(urls[1]).toContain("b.example.com");
  });
});

// ---------------------------------------------------------------------------
// createQueryKeys (direct mode)
// ---------------------------------------------------------------------------

describe("createQueryKeys (direct mode)", () => {
  it("derives source name from api object", () => {
    const keys = createQueryKeys(api);
    expect(keys("users")).toEqual(["demo", "users"]);
  });

  it("creates method-level keys", () => {
    const keys = createQueryKeys(api);
    expect(keys("users", "getAll")).toEqual(["demo", "users", "getAll"]);
  });

  it("appends variables when provided", () => {
    const keys = createQueryKeys(api);
    expect(keys("users", "getById", { id: 1 })).toEqual([
      "demo",
      "users",
      "getById",
      { id: 1 },
    ]);
  });

  it("uses '_' fallback when api has no name", () => {
    const unnamedApi = defineApi({
      // baseURL omitted intentionally — deriveSourceName falls back to "api"
      groups: { users: usersGroup },
    });
    const keys = createQueryKeys(unnamedApi);
    // deriveSourceName returns "api" when no baseURL is set
    expect(keys("users")[0]).toBe("api");
  });

  it("matches query keys generated by createQueryCaller", async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    const q = createQueryCaller(api);
    const keys = createQueryKeys(api);

    renderHook(() => (q as any).users.useQuery("getAll"), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache[0]?.queryKey).toEqual(keys("users", "getAll"));
  });
});
