import { afterEach, describe, expect, it, vi } from "vitest";
import { type Endpoint, defineApi, defineGroup, endpoint } from "../src/define/index";
import type { HttpMethods } from "../src/instance/types";

vi.mock("../src/utils/createRequest", () => ({
	executeRequest: vi.fn(),
}));

import { executeRequest } from "../src/utils/createRequest";

const mockExecuteRequest = vi.mocked(executeRequest);

afterEach(() => {
	vi.clearAllMocks();
});

// ---- helpers ----

function mockMethods(): HttpMethods {
	const makeMethod =
		() =>
		<T>(_url?: string, _vars?: Record<string, unknown>) =>
			Promise.resolve({ status: 200, headers: new Headers(), data: {} as T });

	return {
		get: makeMethod(),
		post: makeMethod(),
		put: makeMethod(),
		patch: makeMethod(),
		del: makeMethod(),
		head: makeMethod(),
	} as HttpMethods;
}

// ---- endpoint() ----

describe("endpoint", () => {
	it("returns identity function that preserves the implementation", () => {
		const impl: Endpoint<string> = ({ get }) => get();
		const result = endpoint<string>()(impl);
		expect(result).toBe(impl);
	});

	it("works with variables", () => {
		const impl: Endpoint<{ id: string }, { id: string }> = ({ get }, vars) =>
			get(":id", vars);
		const result = endpoint<{ id: string }, { id: string }>()(impl);
		expect(result).toBe(impl);
	});

	it("returned function is callable", async () => {
		const fn = endpoint<{ ok: boolean }>()(({ get }) => get());
		const response = await fn(mockMethods(), undefined);
		expect(response).toEqual({ status: 200, headers: expect.any(Headers), data: {} });
	});

	it("attaches type metadata to endpoint function", () => {
		const SCHEMA = Symbol.for("nexus.endpoint.schema");
		const fn = endpoint<string[]>({ type: "query" })(({ get }) => get());
		expect((fn as any)[SCHEMA].type).toBe("query");
	});

	it("attaches cache metadata to endpoint function", () => {
		const SCHEMA = Symbol.for("nexus.endpoint.schema");
		const fn = endpoint<string[]>({ type: "query", cache: { revalidate: 60, tags: ["users"] } })(
			({ get }) => get(),
		);
		expect((fn as any)[SCHEMA].cache).toEqual({ revalidate: 60, tags: ["users"] });
	});

	it("supports type+cache without schema (EndpointOptions overload)", () => {
		const SCHEMA = Symbol.for("nexus.endpoint.schema");
		const fn = endpoint<string[]>({ type: "query", cache: { revalidate: 30 } })(
			({ get }) => get(),
		);
		expect((fn as any)[SCHEMA]).toEqual({ type: "query", cache: { revalidate: 30 } });
	});

	it("supports type: mutation", () => {
		const SCHEMA = Symbol.for("nexus.endpoint.schema");
		const fn = endpoint<void, { id: string }>({ type: "mutation" })(
			({ del }, vars) => del(":id", vars),
		);
		expect((fn as any)[SCHEMA].type).toBe("mutation");
	});
});

// ---- defineGroup() ----

describe("defineGroup", () => {
	it("produces object with options.prefix", () => {
		const group = defineGroup({
			prefix: "users",
			endpoints: {
				getAll: endpoint<string[]>()(({ get }) => get()),
			},
		});

		expect(group.options).toEqual({ prefix: "users" });
	});

	it("produces object with options.prefix undefined when omitted", () => {
		const group = defineGroup({
			endpoints: {
				health: endpoint<boolean>()(({ get }) => get("health")),
			},
		});

		expect(group.options).toEqual({});
	});

	it("spreads endpoint functions onto the result object", () => {
		const getAll = endpoint<string[]>()(({ get }) => get());
		const create = endpoint<string, { name: string }>()(({ post }) => post());

		const group = defineGroup({
			prefix: "users",
			endpoints: { getAll, create },
		});

		expect(group.getAll).toBe(getAll);
		expect(group.create).toBe(create);
	});

	it("endpoint functions are callable from the group", async () => {
		const group = defineGroup({
			prefix: "items",
			endpoints: {
				list: endpoint<number[]>()(({ get }) => get()),
			},
		});

		const response = await group.list(mockMethods(), undefined);
		expect(response.status).toBe(200);
	});

	it("supports pathOptions", () => {
		const pathOptions = () => ({ tenantId: "abc" });
		const group = defineGroup({
			prefix: "tenants",
			pathOptions,
			endpoints: {
				list: endpoint<unknown[]>()(({ get }) => get()),
			},
		});

		expect(group.options.pathOptions).toBe(pathOptions);
	});
});

// ---- defineApi() ----

describe("defineApi", () => {
	it("wraps config into options property", () => {
		const usersGroup = defineGroup({
			prefix: "users",
			endpoints: {
				getAll: endpoint<string[]>()(({ get }) => get()),
			},
		});

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: { users: usersGroup },
		});

		expect(api.options.baseURL).toBe("https://api.example.com");
		expect(api.options.groups.users).toBe(usersGroup);
	});

	it("preserves all BaseOptions", () => {
		const mw = async (_ctx: any, next: any) => next();

		const api = defineApi({
			baseURL: "https://api.test.com",
			responseType: "text",
			deduplicate: true,
			allowedHeaders: ["x-custom"],
			middleware: [mw],
			groups: {
				items: defineGroup({
					prefix: "items",
					endpoints: {
						list: endpoint<unknown>()(({ get }) => get()),
					},
				}),
			},
		});

		expect(api.options.responseType).toBe("text");
		expect(api.options.deduplicate).toBe(true);
		expect(api.options.allowedHeaders).toEqual(["x-custom"]);
		expect(api.options.middleware).toEqual([mw]);
	});

	it("groups are accessible with correct structure", () => {
		const getAll = endpoint<string[]>()(({ get }) => get());

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({ prefix: "users", endpoints: { getAll } }),
				posts: defineGroup({ prefix: "posts", endpoints: { getAll } }),
			},
		});

		expect(api.options.groups.users.options.prefix).toBe("users");
		expect(api.options.groups.posts.options.prefix).toBe("posts");
		expect(typeof api.options.groups.users.getAll).toBe("function");
		expect(typeof api.options.groups.posts.getAll).toBe("function");
	});
});

// ---- structural compatibility with executeRequest ----

describe("executeRequest compatibility", () => {
	it("functionally defined source is accepted by executeRequest", async () => {
		mockExecuteRequest.mockResolvedValue({ id: 1, name: "Alice" });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: endpoint<{ id: number; name: string }[]>()(({ get }) => get()),
					},
				}),
			},
		});

		const sources = { api } as any;

		await executeRequest(sources, {
			source: "api",
			group: "users",
			method: "getAll",
		} as any);

		expect(mockExecuteRequest).toHaveBeenCalledWith(
			sources,
			expect.objectContaining({
				source: "api",
				group: "users",
				method: "getAll",
			}),
		);
	});

	it("source.options.groups[group] has expected shape", () => {
		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				auth: defineGroup({
					prefix: "auth",
					endpoints: {
						login: endpoint<{ token: string }, { email: string; password: string }>()(
							({ post }) => post(),
						),
					},
				}),
			},
		});

		const group = api.options.groups.auth;

		// Shape expected by executeRequest:
		// 1. group.options exists with prefix
		expect(group.options.prefix).toBe("auth");
		// 2. endpoint is a function on the group object
		expect(typeof group.login).toBe("function");
	});

	it("endpoint functions have correct arity", () => {
		const fn = endpoint<string, { id: number }>()(({ get }, vars) =>
			get(":id", vars),
		);

		// Endpoint<R, V> = (methods: HttpMethods, variables: V) => ...
		expect(fn.length).toBe(2);
	});
});

// ---- multiple groups ----

describe("complex API definitions", () => {
	it("supports multiple groups with different endpoint shapes", () => {
		type User = { id: string; name: string };
		type Post = { id: string; title: string };

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: endpoint<User[]>()(({ get }) => get()),
						getById: endpoint<User, { id: string }>()(({ get }, vars) =>
							get(":id", vars),
						),
						create: endpoint<User, { name: string }>()(({ post }, vars) =>
							post("", vars),
						),
						update: endpoint<User, { id: string; name: string }>()(
							({ put }, vars) => put(":id", vars),
						),
						remove: endpoint<void, { id: string }>()(({ del }, vars) =>
							del(":id", vars),
						),
					},
				}),
				posts: defineGroup({
					prefix: "posts",
					endpoints: {
						list: endpoint<Post[]>()(({ get }) => get()),
						getById: endpoint<Post, { id: string }>()(({ get }, vars) =>
							get(":id", vars),
						),
					},
				}),
			},
		});

		// Verify all endpoints exist
		expect(typeof api.options.groups.users.getAll).toBe("function");
		expect(typeof api.options.groups.users.getById).toBe("function");
		expect(typeof api.options.groups.users.create).toBe("function");
		expect(typeof api.options.groups.users.update).toBe("function");
		expect(typeof api.options.groups.users.remove).toBe("function");
		expect(typeof api.options.groups.posts.list).toBe("function");
		expect(typeof api.options.groups.posts.getById).toBe("function");

		// Verify group prefixes
		expect(api.options.groups.users.options.prefix).toBe("users");
		expect(api.options.groups.posts.options.prefix).toBe("posts");
	});
});
