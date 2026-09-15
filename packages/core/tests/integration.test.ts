/**
 * Integration test: proves the full pipeline works with the functional API.
 *
 * defineApi/defineGroup/endpoint → executeRequest → HttpClient → fetch (mocked) → response
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineApi, defineGroup, courier } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { executeRequest } from "../src/utils/execute";

const { query, mutation } = courier();

const fetchSpy = vi.fn();

function mockFetchResponse(data: unknown, status = 200, headers = new Headers()) {
	return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

beforeEach(() => {
	fetchSpy.mockReset();
	vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---- define a realistic API ----

type User = { id: number; name: string; email: string };
type Post = { id: number; title: string; body: string };

const usersGroup = defineGroup({
	prefix: "users",
	endpoints: {
		getAll: query.response<User[]>().via(({ get }) => get()),
		getById: query.variables<{ id: number }>().response<User>().via(({ get }, vars) => get(":id", vars)),
		create: mutation.variables<{ name: string; email: string }>().response<User>().via(({ post }, vars) => post("", vars)),
		update: mutation.variables<{ id: number; name: string }>().response<User>().via(({ put }, vars) => put(":id", vars)),
		remove: mutation.variables<{ id: number }>().via(({ del }, vars) => del(":id", vars)),
	},
});

const postsGroup = defineGroup({
	prefix: "posts",
	endpoints: {
		list: query.response<Post[]>().via(({ get }) => get()),
		getById: query.variables<{ id: number }>().response<Post>().via(({ get }, vars) => get(":id", vars)),
	},
});

const api = defineApi({
	baseURL: "https://api.example.com",
	groups: {
		users: usersGroup,
		posts: postsGroup,
	},
});

const sources = { api };

// ---- tests ----

describe("integration: functional API → executeRequest → response", () => {
	it("GET all users via group endpoint", async () => {
		const users: User[] = [
			{ id: 1, name: "Alice", email: "alice@test.com" },
			{ id: 2, name: "Bob", email: "bob@test.com" },
		];
		fetchSpy.mockResolvedValue(mockFetchResponse(users));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "getAll",
		});

		expect(result).toEqual(users);
		expect(fetchSpy).toHaveBeenCalled();
		const [, options] = fetchSpy.mock.calls[0]!;
		expect(options.method).toBe("GET");
	});

	it("GET user by id with path params", async () => {
		const user: User = { id: 42, name: "Charlie", email: "charlie@test.com" };
		fetchSpy.mockResolvedValue(mockFetchResponse(user));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "getById",
			variables: { id: 42 },
		});

		expect(result).toEqual(user);
		expect(fetchSpy).toHaveBeenCalled();
		const [, options] = fetchSpy.mock.calls[0]!;
		expect(options.method).toBe("GET");
	});

	it("POST create user with body", async () => {
		const newUser: User = { id: 3, name: "Diana", email: "diana@test.com" };
		fetchSpy.mockResolvedValue(mockFetchResponse(newUser, 201));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "create",
			variables: { name: "Diana", email: "diana@test.com" },
		});

		expect(result).toEqual(newUser);
		expect(fetchSpy).toHaveBeenCalled();
		const [, options] = fetchSpy.mock.calls[0]!;
		expect(options.method).toBe("POST");
	});

	it("PUT update user", async () => {
		const updated: User = { id: 1, name: "Alice Updated", email: "alice@test.com" };
		fetchSpy.mockResolvedValue(mockFetchResponse(updated));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "update",
			variables: { id: 1, name: "Alice Updated" },
		});

		expect(result).toEqual(updated);
		expect(fetchSpy).toHaveBeenCalled();
		const [, options] = fetchSpy.mock.calls[0]!;
		expect(options.method).toBe("PUT");
	});

	it("DELETE user", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse(null, 204));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "remove",
			variables: { id: 1 },
		});

		expect(result).toBeNull();
	});

	it("works across different groups (posts)", async () => {
		const posts: Post[] = [{ id: 1, title: "Hello", body: "World" }];
		fetchSpy.mockResolvedValue(mockFetchResponse(posts));

		const result = await executeRequest(sources, {
			source: "api",
			group: "posts",
			method: "list",
		});

		expect(result).toEqual(posts);
	});

	it("returns rawData envelope when requested", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1 }]));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "getAll",
			options: { rawData: true },
		});

		expect(result).toEqual(
			expect.objectContaining({
				status: 200,
				data: [{ id: 1 }],
			}),
		);
	});
});

describe("integration: middleware with functional API", () => {
	it("middleware receives correct context", async () => {
		const spy = vi.fn();
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const { defineMiddleware } = await import("../src/middleware/index");

		const mw = defineMiddleware("spy", "wrap", async (ctx, next) => {
			spy(ctx);
			return next();
		});

		const api = defineApi({
			baseURL: "https://api.example.com",
			middleware: [mw],
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: query.response<User[]>().via(({ get }) => get()),
					},
				}),
			},
		});

		await executeRequest({ api }, {
			source: "api",
			group: "users",
			method: "getAll",
		});

		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "api",
				group: "users",
				method: "getAll",
			}),
		);
	});

	it("middleware can transform response", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ raw: true }));

		const { defineMiddleware } = await import("../src/middleware/index");

		const mw = defineMiddleware("transform", "wrap", async (_ctx, next) => {
			const res = await next();
			return { ...res, data: { transformed: true } };
		});

		const api = defineApi({
			baseURL: "https://api.example.com",
			middleware: [mw],
			groups: {
				data: defineGroup({
					prefix: "data",
					endpoints: {
						fetch: query.via(({ get }) => get()),
					},
				}),
			},
		});

		const result = await executeRequest({ api }, {
			source: "api",
			group: "data",
			method: "fetch",
		});

		expect(result).toEqual({ transformed: true });
	});

	it("middleware can catch endpoint errors", async () => {
		const errorSpy = vi.fn();

		const { defineMiddleware } = await import("../src/middleware/index");

		const mw = defineMiddleware("errorCatcher", "wrap", async (_ctx, next) => {
			try {
				return await next();
			} catch (error) {
				errorSpy(error);
				throw error;
			}
		});

		const api = defineApi({
			baseURL: "https://api.example.com",
			middleware: [mw],
			groups: {
				ops: defineGroup({
					prefix: "ops",
					endpoints: {
						fail: query.response<never>().via(({ get }) => {
							// addresses the endpoint, then fails the way a refused upstream does
							get("fail");
							throw new HTTPError({
								status: 500,
								headers: new Headers(),
								data: { message: "boom" },
							});
						}),
					},
				}),
			},
		});

		try {
			await executeRequest({ api }, {
				source: "api",
				group: "ops",
				method: "fail",
			});
		} catch {
			// expected
		}

		expect(errorSpy).toHaveBeenCalledWith(expect.any(HTTPError));
	});
});

describe("integration: multiple sources", () => {
	it("routes to correct source", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ token: "abc" }));

		const authApi = defineApi({
			baseURL: "https://auth.example.com",
			groups: {
				session: defineGroup({
					prefix: "session",
					endpoints: {
						me: query.response<{ token: string }>().via(({ get }) => get("me")),
					},
				}),
			},
		});

		const multiSources = { api, auth: authApi };

		const result = await executeRequest(multiSources, {
			source: "auth",
			group: "session",
			method: "me",
		});

		expect(result).toEqual({ token: "abc" });
	});

	it("rejects unknown source", async () => {
		try {
			await executeRequest(sources, {
				source: "unknown",
				group: "users",
				method: "getAll",
			});
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(HTTPError);
			expect((error as HTTPError).status).toBe(400);
		}
	});

	it("rejects unknown method in group", async () => {
		try {
			await executeRequest(sources, {
				source: "api",
				group: "users",
				method: "nonexistent",
			});
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(HTTPError);
			expect((error as HTTPError).status).toBe(400);
		}
	});
});

describe("integration: HTTP-semantic proxy", () => {
	it("rejects GET proxy for a write", async () => {
		// `create` is a mutation, so it must not be reachable over a cacheable GET
		try {
			await executeRequest(sources, {
				source: "api",
				group: "users",
				method: "create",
			}, { proxyMethod: "GET" } as any);
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(HTTPError);
			expect((error as HTTPError).status).toBe(405);
		}
	});

	it("allows GET proxy for endpoints with type: query", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: "A", email: "a@b.com" }]));

		const queryApi = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: query.response<User[]>().via(({ get }) => get()),
					},
				}),
			},
		});

		const result = await executeRequest({ api: queryApi }, {
			source: "api",
			group: "users",
			method: "getAll",
		}, { proxyMethod: "GET" } as any);

		expect(result).toEqual([{ id: 1, name: "A", email: "a@b.com" }]);
	});

	it("allows POST proxy for any endpoint regardless of type", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const queryApi = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: query.response<User[]>().via(({ get }) => get()),
					},
				}),
			},
		});

		const result = await executeRequest({ api: queryApi }, {
			source: "api",
			group: "users",
			method: "getAll",
		}, { proxyMethod: "POST" } as any);

		expect(result).toEqual([]);
	});

	it("adds Cache-Control header for GET proxy with cache config", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: "A", email: "a@b.com" }]));

		const { NextResponse } = await import("next/server");

		const cachedApi = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: query.response<User[]>().cache({ revalidate: 60 }).via(
							({ get }) => get(),
						),
					},
				}),
			},
		});

		const response = await executeRequest({ api: cachedApi }, {
			source: "api",
			group: "users",
			method: "getAll",
		}, { res: new NextResponse(), proxyMethod: "GET" }) as Response;

		expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
	});

	it("adds x-courier-tags header for GET proxy with cache tags", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const { NextResponse } = await import("next/server");

		const taggedApi = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: query.response<User[]>().cache({ revalidate: 30, tags: ["users", "list"] }).via(({ get }) => get()),
					},
				}),
			},
		});

		const response = await executeRequest({ api: taggedApi }, {
			source: "api",
			group: "users",
			method: "getAll",
		}, { res: new NextResponse(), proxyMethod: "GET" }) as Response;

		expect(response.headers.get("x-courier-tags")).toBe("users,list");
		expect(response.headers.get("cache-control")).toBe("s-maxage=30, stale-while-revalidate");
	});

	it("does not add cache headers for POST proxy even with cache config", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		const { NextResponse } = await import("next/server");

		const cachedApi = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: query.response<User[]>().cache({ revalidate: 60 }).via(
							({ get }) => get(),
						),
					},
				}),
			},
		});

		const response = await executeRequest({ api: cachedApi }, {
			source: "api",
			group: "users",
			method: "getAll",
		}, { res: new NextResponse(), proxyMethod: "POST" }) as Response;

		expect(response.headers.get("cache-control")).toBeNull();
	});

	it("works with type: mutation for POST endpoints", async () => {
		fetchSpy.mockResolvedValue(mockFetchResponse({ id: 1, name: "Alice", email: "a@b.com" }, 201));

		const mutationApi = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						create: mutation.variables<{ name: string; email: string }>().response<User>().via(
							({ post }, vars) => post("", vars),
						),
					},
				}),
			},
		});

		const result = await executeRequest({ api: mutationApi }, {
			source: "api",
			group: "users",
			method: "create",
			variables: { name: "Alice", email: "a@b.com" },
		});

		expect(result).toEqual({ id: 1, name: "Alice", email: "a@b.com" });
	});
});
