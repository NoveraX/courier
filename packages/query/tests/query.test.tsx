/**
 * @vitest-environment jsdom
 */

import { type ReactNode, Suspense, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Endpoint } from "@noverax/nexus/define";
import { createQueryKeys } from "../src/keys";
import { createQueryRequest, optimisticOptions } from "../src/index";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: new Headers({ "content-type": "application/json" }),
	});
}

type TestApi = {
	api: {
		options: {
			groups: {
				users: {
					getAll: Endpoint<{ id: number; name: string }[]>;
					getById: Endpoint<{ id: number; name: string }, { id: number }>;
					create: Endpoint<{ id: number; name: string }, { name: string }>;
					list: Endpoint<{ items: { id: number }[]; nextCursor: number | null }, { cursor: number }>;
				};
				cache: {
					clear: Endpoint<{ ok: boolean }>;
				};
			};
		};
	};
};

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
// createQueryRequest — basic
// ---------------------------------------------------------------------------

describe("createQueryRequest", () => {
	it("returns all hooks, prefetchQuery, and request", () => {
		const result = createQueryRequest<TestApi>();
		expect(result).toHaveProperty("useQuery");
		expect(result).toHaveProperty("useSuspenseQuery");
		expect(result).toHaveProperty("useInfiniteQuery");
		expect(result).toHaveProperty("useMutation");
		expect(result).toHaveProperty("prefetchQuery");
		expect(result).toHaveProperty("request");
	});

	it("passes defaults to createProxyRequest", () => {
		const defaults = { proxyUrl: "/custom" };
		const { request } = createQueryRequest<TestApi>(defaults);
		expect(typeof request).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// useQuery
// ---------------------------------------------------------------------------

describe("useQuery", () => {
	it("fetches data and returns result", async () => {
		const users = [{ id: 1, name: "Alice" }];
		fetchSpy.mockResolvedValue(mockFetchResponse(users));

		const { useQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(users);
	});

	it("passes variables to the request", async () => {
		const user = { id: 1, name: "Alice" };
		fetchSpy.mockResolvedValue(mockFetchResponse(user));

		const { useQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useQuery("api", "users:getById", { variables: { id: 1 } }),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const body = getFetchBody();
		expect(body?.variables).toEqual({ id: 1 });
	});

	it("builds query key without variables when undefined", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const { useQuery } = createQueryRequest<TestApi>();
		renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

		const cache = queryClient.getQueryCache().getAll();
		expect(cache).toHaveLength(1);
		expect(cache[0]?.queryKey).toEqual(["api", "users:getAll"]);
	});

	it("builds query key with variables when provided", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({}));

		const { useQuery } = createQueryRequest<TestApi>();
		renderHook(
			() => useQuery("api", "users:getById", { variables: { id: 5 } }),
			{ wrapper },
		);

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

		const cache = queryClient.getQueryCache().getAll();
		expect(cache).toHaveLength(1);
		expect(cache[0]?.queryKey).toEqual(["api", "users:getById", { id: 5 }]);
	});

	it("forwards extra query options (enabled: false)", () => {
		const { useQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useQuery("api", "users:getAll", { enabled: false }),
			{ wrapper },
		);

		expect(result.current.fetchStatus).toBe("idle");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("handles fetch errors", async () => {
		fetchSpy.mockRejectedValue(new Error("Network error"));

		const { useQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error?.message).toBe("Network error");
	});
});

// ---------------------------------------------------------------------------
// useSuspenseQuery
// ---------------------------------------------------------------------------

describe("useSuspenseQuery", () => {
	it("fetches data with suspense", async () => {
		const users = [{ id: 1, name: "Alice" }];
		fetchSpy.mockResolvedValue(mockFetchResponse(users));

		const { useSuspenseQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useSuspenseQuery("api", "users:getAll"),
			{ wrapper: suspenseWrapper },
		);

		await waitFor(() => expect(result.current.data).toEqual(users));
	});

	it("passes variables in suspense mode", async () => {
		const user = { id: 1, name: "Alice" };
		fetchSpy.mockResolvedValue(mockFetchResponse(user));

		const { useSuspenseQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useSuspenseQuery("api", "users:getById", { variables: { id: 1 } }),
			{ wrapper: suspenseWrapper },
		);

		await waitFor(() => expect(result.current.data).toEqual(user));

		const body = getFetchBody();
		expect(body?.variables).toEqual({ id: 1 });
	});

	it("builds correct query key", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const { useSuspenseQuery } = createQueryRequest<TestApi>();
		renderHook(
			() => useSuspenseQuery("api", "users:getAll"),
			{ wrapper: suspenseWrapper },
		);

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

		const cache = queryClient.getQueryCache().getAll();
		expect(cache).toHaveLength(1);
		expect(cache[0]?.queryKey).toEqual(["api", "users:getAll"]);
	});
});

// ---------------------------------------------------------------------------
// useInfiniteQuery
// ---------------------------------------------------------------------------

describe("useInfiniteQuery", () => {
	it("fetches first page", async () => {
		const page1 = { items: [{ id: 1 }], nextCursor: 2 };
		fetchSpy.mockResolvedValue(mockFetchResponse(page1));

		const { useInfiniteQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() =>
				useInfiniteQuery("api", "users:list", {
					initialPageParam: 0,
					getNextPageParam: (lastPage) => lastPage.nextCursor,
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

		const { useInfiniteQuery } = createQueryRequest<TestApi>();
		renderHook(
			() =>
				useInfiniteQuery("api", "users:list", {
					initialPageParam: 0,
					getNextPageParam: (lastPage) => lastPage.nextCursor,
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

		const { useInfiniteQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() =>
				useInfiniteQuery("api", "users:list", {
					initialPageParam: 0,
					getNextPageParam: (lastPage) => lastPage.nextCursor,
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

	it("builds query key without variables", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ items: [], nextCursor: null }));

		const { useInfiniteQuery } = createQueryRequest<TestApi>();
		renderHook(
			() =>
				useInfiniteQuery("api", "users:list", {
					initialPageParam: 0,
					getNextPageParam: (lastPage) => lastPage.nextCursor,
					variables: (pageParam: number) => ({ cursor: pageParam }),
				}),
			{ wrapper },
		);

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

		const cache = queryClient.getQueryCache().getAll();
		expect(cache).toHaveLength(1);
		expect(cache[0]?.queryKey).toEqual(["api", "users:list"]);
	});
});

// ---------------------------------------------------------------------------
// useMutation
// ---------------------------------------------------------------------------

describe("useMutation", () => {
	it("performs mutation and returns data", async () => {
		const created = { id: 1, name: "Alice" };
		fetchSpy.mockResolvedValue(mockFetchResponse(created));

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useMutation("api", "users:create"),
			{ wrapper },
		);

		result.current.mutate({ name: "Alice" });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(created);
	});

	it("passes variables to mutationFn", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useMutation("api", "users:create"),
			{ wrapper },
		);

		result.current.mutate({ name: "Bob" } as any);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const body = getFetchBody();
		expect(body?.variables).toEqual({ name: "Bob" });
	});

	it("calls onSuccess callback", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));
		const onSuccess = vi.fn();

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() =>
				useMutation("api", "users:create", {
					onSuccess: onSuccess as (data: { id: number; name: string }) => void,
				}),
			{ wrapper },
		);

		result.current.mutate({ name: "Alice" });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(onSuccess).toHaveBeenCalled();
		expect(onSuccess.mock.calls[0]?.[0]).toEqual({ id: 1 });
	});

	it("handles mutation errors", async () => {
		fetchSpy.mockRejectedValue(new Error("Server error"));

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useMutation("api", "users:create"),
			{ wrapper },
		);

		result.current.mutate({ name: "Alice" });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error?.message).toBe("Server error");
	});

	it("mutates without variables for void endpoints", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useMutation("api", "cache:clear"),
			{ wrapper },
		);

		result.current.mutate();

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});

	it("auto-invalidates queries on mutation success", async () => {
		const spy = vi.spyOn(queryClient, "invalidateQueries");
		fetchSpy.mockResolvedValue(mockFetchResponse({ id: 2, name: "New" }));

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() =>
				useMutation("api", "users:create", {
					invalidate: [["api", "users:getAll"]],
				}),
			{ wrapper },
		);

		result.current.mutate({ name: "New" });

		await waitFor(() =>
			expect(spy).toHaveBeenCalledWith({ queryKey: ["api", "users:getAll"] }),
		);
	});

	it("calls user onSettled alongside auto-invalidation", async () => {
		const spy = vi.spyOn(queryClient, "invalidateQueries");
		fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1 }));

		const onSettled = vi.fn();
		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() =>
				useMutation("api", "users:create", {
					invalidate: [["api", "users:getAll"]],
					onSettled: onSettled as () => void,
				}),
			{ wrapper },
		);

		result.current.mutate({ name: "Alice" });

		await waitFor(() => {
			expect(onSettled).toHaveBeenCalled();
			expect(spy).toHaveBeenCalledWith({ queryKey: ["api", "users:getAll"] });
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

		const { prefetchQuery } = createQueryRequest<TestApi>();
		await prefetchQuery(queryClient, "api", "users:getAll");

		const cached = queryClient.getQueryData(["api", "users:getAll"]);
		expect(cached).toEqual(users);
	});

	it("prefetches with variables", async () => {
		const user = { id: 1, name: "Alice" };
		fetchSpy.mockResolvedValue(mockFetchResponse(user));

		const { prefetchQuery } = createQueryRequest<TestApi>();
		await prefetchQuery(queryClient, "api", "users:getById", { variables: { id: 1 } });

		const cached = queryClient.getQueryData(["api", "users:getById", { id: 1 }]);
		expect(cached).toEqual(user);
	});

	it("respects staleTime option", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const { prefetchQuery } = createQueryRequest<TestApi>();
		await prefetchQuery(queryClient, "api", "users:getAll", { staleTime: 60_000 });

		const state = queryClient.getQueryState(["api", "users:getAll"]);
		expect(state?.data).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// optimisticOptions
// ---------------------------------------------------------------------------

describe("optimisticOptions", () => {
	it("sets optimistic data on mutate", async () => {
		queryClient.setQueryData(["api", "users:getAll"], [{ id: 1, name: "Alice" }]);

		const opts = optimisticOptions<{ id: number; name: string }[], { name: string }>(queryClient, {
			queryKey: ["api", "users:getAll"],
			updater: (old, vars) => [...(old ?? []), { id: 999, name: vars.name }],
		});

		await opts.onMutate({ name: "Bob" });

		const cached = queryClient.getQueryData<{ id: number; name: string }[]>(["api", "users:getAll"]);
		expect(cached).toEqual([
			{ id: 1, name: "Alice" },
			{ id: 999, name: "Bob" },
		]);
	});

	it("rolls back on error", async () => {
		const original = [{ id: 1, name: "Alice" }];
		queryClient.setQueryData(["api", "users:getAll"], original);

		const opts = optimisticOptions<{ id: number; name: string }[], { name: string }>(queryClient, {
			queryKey: ["api", "users:getAll"],
			updater: (old, vars) => [...(old ?? []), { id: 999, name: vars.name }],
		});

		const context = await opts.onMutate({ name: "Bob" });
		opts.onError(new Error("fail") as any, { name: "Bob" }, context);

		const cached = queryClient.getQueryData(["api", "users:getAll"]);
		expect(cached).toEqual(original);
	});

	it("invalidates on settled", async () => {
		queryClient.setQueryData(["api", "users:getAll"], []);

		const opts = optimisticOptions<{ id: number; name: string }[], { name: string }>(queryClient, {
			queryKey: ["api", "users:getAll"],
			updater: (old, vars) => [...(old ?? []), { id: 1, name: vars.name }],
		});

		await opts.onMutate({ name: "Alice" });
		opts.onSettled();

		const state = queryClient.getQueryState(["api", "users:getAll"]);
		expect(state?.isInvalidated).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// createQueryKeys
// ---------------------------------------------------------------------------

describe("createQueryKeys", () => {
	it("creates source-level key", () => {
		const key = createQueryKeys<TestApi>();
		expect(key("api")).toEqual(["api"]);
	});

	it("creates endpoint-level key", () => {
		const key = createQueryKeys<TestApi>();
		expect(key("api", "users:getAll")).toEqual(["api", "users:getAll"]);
	});

	it("creates key with variables", () => {
		const key = createQueryKeys<TestApi>();
		expect(key("api", "users:getById", { id: 1 })).toEqual(["api", "users:getById", { id: 1 }]);
	});

	it("keys match query cache keys", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));
		const key = createQueryKeys<TestApi>();

		const { useQuery } = createQueryRequest<TestApi>();
		renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

		const cached = queryClient.getQueryData(key("api", "users:getAll"));
		expect(cached).toEqual([]);
	});
});
