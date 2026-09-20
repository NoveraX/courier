import { afterEach, describe, expect, it, vi } from "vitest";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { defineMiddleware } from "../src/middleware/index";

vi.mock("../src/utils/execute", () => ({
	executeRequest: vi.fn(),
}));

import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

const mockExecuteRequest = vi.mocked(executeRequest);

afterEach(() => {
	vi.clearAllMocks();
});

// ---- helpers ----


// ---- collection helpers ----

describe("defineGroup", () => {
	it("produces object with options.prefix", () => {
		const group = defineGroup({
			prefix: "users",
			endpoints: {
				getAll: endpoint.response<string[]>().get(""),
			},
		});

		expect(group.options).toEqual({ prefix: "users" });
	});

	it("produces object with options.prefix undefined when omitted", () => {
		const group = defineGroup({
			endpoints: {
				health: endpoint.response<boolean>().get("health"),
			},
		});

		expect(group.options).toEqual({});
	});

	it("spreads endpoint functions onto the result object", () => {
		const getAll = endpoint.response<string[]>().get("");
		const create = endpoint.variables<{ name: string }>().response<string>().post("");

		const group = defineGroup({
			prefix: "users",
			endpoints: { getAll, create },
		});

		expect(group.getAll).toBe(getAll);
		expect(group.create).toBe(create);
	});

	it("keeps the wire shape of each endpoint it holds", () => {
		const group = defineGroup({
			prefix: "items",
			endpoints: {
				list: endpoint.response<number[]>().get(""),
			},
		});

		expect(group.list.method).toBe("get");
		expect(group.list.path).toBe("");
	});

	it("supports pathOptions", () => {
		const pathOptions = () => ({ tenantId: "abc" });
		const group = defineGroup({
			prefix: "tenants",
			pathOptions,
			endpoints: {
				list: endpoint.response<unknown[]>().get(""),
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
				getAll: endpoint.response<string[]>().get(""),
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
		const mw = defineMiddleware("test", "wrap", async (_ctx, next) => next());

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
						list: endpoint.get(""),
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
		const getAll = endpoint.response<string[]>().get("");

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({ prefix: "users", endpoints: { getAll } }),
				posts: defineGroup({ prefix: "posts", endpoints: { getAll } }),
			},
		});

		expect(api.options.groups.users.options.prefix).toBe("users");
		expect(api.options.groups.posts.options.prefix).toBe("posts");
		expect(typeof api.options.groups.users.getAll).toBe("object");
		expect(typeof api.options.groups.posts.getAll).toBe("object");
	});
});

// ---- defineApi() flat ----

describe("defineApi flat (no groups)", () => {
	it("spreads endpoints onto the result object", () => {
		const getAll = endpoint.response<string[]>().get("");
		const create = endpoint.variables<{ name: string }>().response<string>().post("");

		const api = defineApi({
			baseURL: "https://api.example.com",
			endpoints: { getAll, create },
		});

		expect(typeof api.getAll).toBe("object");
		expect(typeof api.create).toBe("object");
		expect(api.options.baseURL).toBe("https://api.example.com");
	});

	it("does not add groups to options", () => {
		const api = defineApi({
			baseURL: "https://flat.api",
			endpoints: {
				health: endpoint.response<boolean>().get("health"),
			},
		});

		expect((api.options as any).groups).toBeUndefined();
	});
});

// ---- defineApi() mixed (groups + flat endpoints) ----

describe("defineApi mixed (groups + flat endpoints)", () => {
	it("combines groups in options and flat endpoints on source", () => {
		const usersGroup = defineGroup({
			prefix: "users",
			endpoints: {
				getAll: endpoint.response<string[]>().get(""),
			},
		});

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: { users: usersGroup },
			endpoints: {
				healthCheck: endpoint.response<{ ok: boolean }>().get("health"),
			},
		});

		// Groups accessible via options
		expect(api.options.groups.users).toBe(usersGroup);
		expect(typeof api.options.groups.users.getAll).toBe("object");

		// Flat endpoints on source object
		expect(typeof api.healthCheck).toBe("object");
		expect(api.options.baseURL).toBe("https://api.example.com");
	});

	it("flat endpoints are callable", async () => {
		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				items: defineGroup({
					prefix: "items",
					endpoints: { list: endpoint.response<number[]>().get("") },
				}),
			},
			endpoints: {
				ping: endpoint.response<string>().get("ping"),
			},
		});

		expect(api.ping.method).toBe("get");
		expect(api.ping.path).toBe("ping");
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
						getAll: endpoint.response<{ id: number; name: string }[]>().get(""),
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
						login: endpoint.variables<{ email: string; password: string }>().response<{ token: string }>().post(""),
					},
				}),
			},
		});

		const group = api.options.groups.auth;

		// Shape expected by executeRequest:
		// 1. group.options exists with prefix
		expect(group.options.prefix).toBe("auth");
		// 2. endpoint is a function on the group object
		expect(typeof group.login).toBe("object");
	});

	it("endpoint functions have correct arity", () => {
		const fn = endpoint.variables<{ id: number }>().response<string>().get(":id");

		expect(fn.method).toBe("get");
		expect(fn.path).toBe(":id");
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
						getAll: endpoint.response<User[]>().get(""),
						getById: endpoint.variables<{ id: string }>().response<User>().get(":id"),
						create: endpoint.variables<{ name: string }>().response<User>().post(""),
						update: endpoint.variables<{ id: string; name: string }>().response<User>().put(":id"),
						remove: endpoint.variables<{ id: string }>().del(":id"),
					},
				}),
				posts: defineGroup({
					prefix: "posts",
					endpoints: {
						list: endpoint.response<Post[]>().get(""),
						getById: endpoint.variables<{ id: string }>().response<Post>().get(":id"),
					},
				}),
			},
		});

		// Verify all endpoints exist
		expect(typeof api.options.groups.users.getAll).toBe("object");
		expect(typeof api.options.groups.users.getById).toBe("object");
		expect(typeof api.options.groups.users.create).toBe("object");
		expect(typeof api.options.groups.users.update).toBe("object");
		expect(typeof api.options.groups.users.remove).toBe("object");
		expect(typeof api.options.groups.posts.list).toBe("object");
		expect(typeof api.options.groups.posts.getById).toBe("object");

		// Verify group prefixes
		expect(api.options.groups.users.options.prefix).toBe("users");
		expect(api.options.groups.posts.options.prefix).toBe("posts");
	});
});
