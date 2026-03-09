/**
 * Integration test: proves the full pipeline works with the functional API.
 *
 * defineApi/defineGroup/endpoint → executeRequest → HttpClient → ky (mocked) → response
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { defineApi, defineGroup, endpoint } from "../src/define/index";
import { HTTPError } from "../src/error";
import { executeRequest } from "../src/utils/createRequest";

let mockKyInstance: Record<"get" | "post" | "put" | "patch" | "delete" | "head", ReturnType<typeof vi.fn>>;

function mockResponse(data: unknown, status = 200, headers = new Headers()) {
	return {
		status,
		headers,
		json: () => Promise.resolve(data),
		text: () => Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
		body: new ReadableStream(),
	};
}

beforeEach(() => {
	mockKyInstance = {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
		head: vi.fn(),
	};

	vi.spyOn(ky, "create").mockReturnValue(mockKyInstance as unknown as typeof ky);
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
		getAll: endpoint<User[]>()(({ get }) => get()),
		getById: endpoint<User, { id: number }>()(({ get }, vars) => get(":id", vars)),
		create: endpoint<User, { name: string; email: string }>()(({ post }, vars) => post("", vars)),
		update: endpoint<User, { id: number; name: string }>()(({ put }, vars) => put(":id", vars)),
		remove: endpoint<void, { id: number }>()(({ del }, vars) => del(":id", vars)),
	},
});

const postsGroup = defineGroup({
	prefix: "posts",
	endpoints: {
		list: endpoint<Post[]>()(({ get }) => get()),
		getById: endpoint<Post, { id: number }>()(({ get }, vars) => get(":id", vars)),
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
		mockKyInstance.get.mockResolvedValue(mockResponse(users));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "getAll",
		});

		expect(result).toEqual(users);
		expect(mockKyInstance.get).toHaveBeenCalled();
	});

	it("GET user by id with path params", async () => {
		const user: User = { id: 42, name: "Charlie", email: "charlie@test.com" };
		mockKyInstance.get.mockResolvedValue(mockResponse(user));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "getById",
			variables: { id: 42 },
		});

		expect(result).toEqual(user);
		expect(mockKyInstance.get).toHaveBeenCalled();
	});

	it("POST create user with body", async () => {
		const newUser: User = { id: 3, name: "Diana", email: "diana@test.com" };
		mockKyInstance.post.mockResolvedValue(mockResponse(newUser, 201));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "create",
			variables: { name: "Diana", email: "diana@test.com" },
		});

		expect(result).toEqual(newUser);
		expect(mockKyInstance.post).toHaveBeenCalled();
	});

	it("PUT update user", async () => {
		const updated: User = { id: 1, name: "Alice Updated", email: "alice@test.com" };
		mockKyInstance.put.mockResolvedValue(mockResponse(updated));

		const result = await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "update",
			variables: { id: 1, name: "Alice Updated" },
		});

		expect(result).toEqual(updated);
		expect(mockKyInstance.put).toHaveBeenCalled();
	});

	it("DELETE user", async () => {
		mockKyInstance.delete.mockResolvedValue(mockResponse(null, 204));

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
		mockKyInstance.get.mockResolvedValue(mockResponse(posts));

		const result = await executeRequest(sources, {
			source: "api",
			group: "posts",
			method: "list",
		});

		expect(result).toEqual(posts);
	});

	it("returns rawData envelope when requested", async () => {
		mockKyInstance.get.mockResolvedValue(mockResponse([{ id: 1 }]));

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
		mockKyInstance.get.mockResolvedValue(mockResponse([]));

		const { defineMiddleware } = await import("../src/middleware/index");

		const mw = defineMiddleware(async (ctx, next) => {
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
						getAll: endpoint<User[]>()(({ get }) => get()),
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
		mockKyInstance.get.mockResolvedValue(mockResponse({ raw: true }));

		const { defineMiddleware } = await import("../src/middleware/index");

		const mw = defineMiddleware(async (_ctx, next) => {
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
						fetch: endpoint<unknown>()(({ get }) => get()),
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

		const mw = defineMiddleware(async (_ctx, next) => {
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
						fail: endpoint<never>()((_methods) => {
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
		mockKyInstance.get.mockResolvedValue(mockResponse({ token: "abc" }));

		const authApi = defineApi({
			baseURL: "https://auth.example.com",
			groups: {
				session: defineGroup({
					prefix: "session",
					endpoints: {
						me: endpoint<{ token: string }>()(({ get }) => get("me")),
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
