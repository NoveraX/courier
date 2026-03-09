/**
 * @vitest-environment jsdom
 */

import { type ReactNode, Suspense, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ky", () => {
	return {
		default: { post: vi.fn(), get: vi.fn() },
		HTTPError: class KYHTTPError extends Error {
			response: any;
			constructor(response: any) {
				super(`HTTP ${response.status}`);
				this.name = "HTTPError";
				this.response = response;
			}
		},
	};
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import ky from "ky";
import type { Endpoint } from "@noverax/nexus/define";
import { createQueryKeys } from "../src/keys";
import { createQueryRequest, optimisticOptions } from "../src/index";

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

const mockPost = vi.mocked(ky.post);

function kyResponse(data: unknown, status = 200) {
	const response = { status, headers: new Headers(), ok: status < 400 };
	const p = Promise.resolve(response);
	(p as any).json = () => Promise.resolve(data);
	(p as any).text = () => Promise.resolve(JSON.stringify(data));
	return p as any;
}

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
	mockPost.mockReset();
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

	it("passes defaults to createClientRequest", () => {
		const defaults = { routePath: "/custom" };
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
		mockPost.mockReturnValue(kyResponse(users));

		const { useQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(users);
	});

	it("passes variables to the request", async () => {
		const user = { id: 1, name: "Alice" };
		mockPost.mockReturnValue(kyResponse(user));

		const { useQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useQuery("api", "users:getById", { variables: { id: 1 } }),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const postCall = mockPost.mock.calls[0];
		expect(postCall).toBeDefined();
		const body = postCall?.[1]?.json as any;
		expect(body?.variables).toEqual({ id: 1 });
	});

	it("builds query key without variables when undefined", async () => {
		mockPost.mockReturnValue(kyResponse([]));

		const { useQuery } = createQueryRequest<TestApi>();
		renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(mockPost).toHaveBeenCalled());

		const cache = queryClient.getQueryCache().getAll();
		expect(cache).toHaveLength(1);
		expect(cache[0]?.queryKey).toEqual(["api", "users:getAll"]);
	});

	it("builds query key with variables when provided", async () => {
		mockPost.mockReturnValue(kyResponse({}));

		const { useQuery } = createQueryRequest<TestApi>();
		renderHook(
			() => useQuery("api", "users:getById", { variables: { id: 5 } }),
			{ wrapper },
		);

		await waitFor(() => expect(mockPost).toHaveBeenCalled());

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
		expect(mockPost).not.toHaveBeenCalled();
	});

	it("handles fetch errors", async () => {
		const error = new Error("Network error");
		const p = Promise.reject(error);
		(p as any).json = () => Promise.reject(error);
		(p as any).text = () => Promise.reject(error);
		p.catch(() => {});
		mockPost.mockReturnValue(p as any);

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
		mockPost.mockReturnValue(kyResponse(users));

		const { useSuspenseQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useSuspenseQuery("api", "users:getAll"),
			{ wrapper: suspenseWrapper },
		);

		await waitFor(() => expect(result.current.data).toEqual(users));
	});

	it("passes variables in suspense mode", async () => {
		const user = { id: 1, name: "Alice" };
		mockPost.mockReturnValue(kyResponse(user));

		const { useSuspenseQuery } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useSuspenseQuery("api", "users:getById", { variables: { id: 1 } }),
			{ wrapper: suspenseWrapper },
		);

		await waitFor(() => expect(result.current.data).toEqual(user));

		const body = mockPost.mock.calls[0]?.[1]?.json as any;
		expect(body?.variables).toEqual({ id: 1 });
	});

	it("builds correct query key", async () => {
		mockPost.mockReturnValue(kyResponse([]));

		const { useSuspenseQuery } = createQueryRequest<TestApi>();
		renderHook(
			() => useSuspenseQuery("api", "users:getAll"),
			{ wrapper: suspenseWrapper },
		);

		await waitFor(() => expect(mockPost).toHaveBeenCalled());

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
		mockPost.mockReturnValue(kyResponse(page1));

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
		mockPost.mockReturnValue(kyResponse(page1));

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

		await waitFor(() => expect(mockPost).toHaveBeenCalled());

		const body = mockPost.mock.calls[0]?.[1]?.json as any;
		expect(body?.variables).toEqual({ cursor: 0 });
	});

	it("fetches next page", async () => {
		const page1 = { items: [{ id: 1 }], nextCursor: 2 };
		const page2 = { items: [{ id: 2 }], nextCursor: null };
		mockPost
			.mockReturnValueOnce(kyResponse(page1))
			.mockReturnValueOnce(kyResponse(page2));

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
		mockPost.mockReturnValue(kyResponse({ items: [], nextCursor: null }));

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

		await waitFor(() => expect(mockPost).toHaveBeenCalled());

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
		mockPost.mockReturnValue(kyResponse(created));

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
		mockPost.mockReturnValue(kyResponse({ id: 1 }));

		const { useMutation } = createQueryRequest<TestApi>();
		const { result } = renderHook(
			() => useMutation("api", "users:create"),
			{ wrapper },
		);

		result.current.mutate({ name: "Bob" } as any);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const body = mockPost.mock.calls[0]?.[1]?.json as any;
		expect(body?.variables).toEqual({ name: "Bob" });
	});

	it("calls onSuccess callback", async () => {
		mockPost.mockReturnValue(kyResponse({ id: 1 }));
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
		const error = new Error("Server error");
		const p = Promise.reject(error);
		(p as any).json = () => Promise.reject(error);
		(p as any).text = () => Promise.reject(error);
		p.catch(() => {});
		mockPost.mockReturnValue(p as any);

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
		mockPost.mockReturnValue(kyResponse({ ok: true }));

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
		mockPost.mockReturnValue(kyResponse({ id: 2, name: "New" }));

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
		mockPost.mockReturnValue(kyResponse({ id: 1 }));

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
		mockPost.mockReturnValue(kyResponse(users));

		const { prefetchQuery } = createQueryRequest<TestApi>();
		await prefetchQuery(queryClient, "api", "users:getAll");

		const cached = queryClient.getQueryData(["api", "users:getAll"]);
		expect(cached).toEqual(users);
	});

	it("prefetches with variables", async () => {
		const user = { id: 1, name: "Alice" };
		mockPost.mockReturnValue(kyResponse(user));

		const { prefetchQuery } = createQueryRequest<TestApi>();
		await prefetchQuery(queryClient, "api", "users:getById", { variables: { id: 1 } });

		const cached = queryClient.getQueryData(["api", "users:getById", { id: 1 }]);
		expect(cached).toEqual(user);
	});

	it("respects staleTime option", async () => {
		mockPost.mockReturnValue(kyResponse([]));

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
		mockPost.mockReturnValue(kyResponse([]));
		const key = createQueryKeys<TestApi>();

		const { useQuery } = createQueryRequest<TestApi>();
		renderHook(() => useQuery("api", "users:getAll"), { wrapper });

		await waitFor(() => expect(mockPost).toHaveBeenCalled());

		const cached = queryClient.getQueryData(key("api", "users:getAll"));
		expect(cached).toEqual([]);
	});
});
