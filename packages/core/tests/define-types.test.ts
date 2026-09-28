/**
 * Type inference tests for the functional API.
 *
 * These tests verify that TypeScript correctly infers response types,
 * variable types, and endpoint keys through the entire type pipeline.
 * Each test uses `expectTypeOf` for compile-time assertions.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { defineApi, defineGroup, courier } from "../src/define/index";
import type { InferResponse, InferVariables } from "../src/define/marker";
import type { HttpResponse } from "../src/http-client/types";
import type { FlatClient, GroupClient, InferClient, MixedClient, TypedClient } from "../src/client";

const { endpoint } = courier();

// ---- test fixtures ----

type User = { id: number; name: string };
type Post = { id: number; title: string };
type CreateUserInput = { name: string; email: string };

const usersGroup = defineGroup({
	prefix: "users",
	endpoints: {
		getAll: endpoint.get("").response<User[]>(),
		getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
		create: endpoint.post("").variables<CreateUserInput>().response<User>(),
	},
});

const postsGroup = defineGroup({
	prefix: "posts",
	endpoints: {
		list: endpoint.get("").response<Post[]>(),
	},
});

const api = defineApi({
	baseURL: "https://api.example.com",
	groups: { users: usersGroup, posts: postsGroup },
});

// ---- endpoint() type inference ----

describe("builder type inference", () => {
	it("infers the declared response", () => {
		const fn = endpoint.get("").response<User[]>();
		expectTypeOf<InferResponse<typeof fn>>().toEqualTypeOf<User[]>();
		expectTypeOf<InferVariables<typeof fn>>().toEqualTypeOf<void>();
	});

	it("preserves variables type", () => {
		const fn = endpoint.get(":id").variables<{ id: number }>().response<User>();
		expectTypeOf<InferResponse<typeof fn>>().toEqualTypeOf<User>();
		expectTypeOf<InferVariables<typeof fn>>().toEqualTypeOf<{ id: number }>();
	});

	it("carries no variables when none were declared", () => {
		const fn = endpoint.get("").response<string>();
		expectTypeOf<InferResponse<typeof fn>>().toEqualTypeOf<string>();
		expectTypeOf<InferVariables<typeof fn>>().toEqualTypeOf<void>();
	});
});

// ---- defineGroup() type inference ----

describe("defineGroup() type inference", () => {
	it("exposes endpoint functions as typed properties", () => {
		expectTypeOf<InferResponse<typeof usersGroup.getAll>>().toEqualTypeOf<User[]>();
		expectTypeOf<InferVariables<typeof usersGroup.getAll>>().toEqualTypeOf<void>();
		expectTypeOf<InferResponse<typeof usersGroup.getById>>().toEqualTypeOf<User>();
		expectTypeOf<InferVariables<typeof usersGroup.getById>>().toEqualTypeOf<{ id: number }>();
		expectTypeOf<InferResponse<typeof usersGroup.create>>().toEqualTypeOf<User>();
		expectTypeOf<InferVariables<typeof usersGroup.create>>().toEqualTypeOf<CreateUserInput>();
	});

	it("has options with prefix", () => {
		expectTypeOf(usersGroup.options).toHaveProperty("prefix");
		expectTypeOf(usersGroup.options.prefix).toEqualTypeOf<string | undefined>();
	});
});

// ---- defineApi() type inference ----

describe("defineApi() type inference", () => {
	it("exposes groups on options", () => {
		expectTypeOf(api.options.groups.users).toEqualTypeOf(usersGroup);
		expectTypeOf(api.options.groups.posts).toEqualTypeOf(postsGroup);
	});

	it("exposes baseURL on options", () => {
		expectTypeOf(api.options.baseURL).toEqualTypeOf<string | undefined>();
	});
});

describe("TypedClient type inference", () => {
	type Client = TypedClient<typeof api>;

	it("exposes groups as properties", () => {
		expectTypeOf<Client>().toHaveProperty("users");
		expectTypeOf<Client>().toHaveProperty("posts");
	});

	it("exposes methods on groups", () => {
		type UsersGroup = Client["users"];
		expectTypeOf<UsersGroup["getAll"]>().toBeFunction();
		expectTypeOf<UsersGroup["getById"]>().toBeFunction();
		expectTypeOf<UsersGroup["create"]>().toBeFunction();
	});

	it("getAll returns Promise<User[]>", () => {
		type Result = ReturnType<Client["users"]["getAll"]>;
		expectTypeOf<Result>().toEqualTypeOf<Promise<User[]>>();
	});

	it("getById requires variables and returns Promise<User>", () => {
		type Fn = Client["users"]["getById"];
		expectTypeOf<Fn>().toBeFunction();
		expectTypeOf<Parameters<Fn>>().toEqualTypeOf<[{ id: number }]>();
		expectTypeOf<ReturnType<Fn>>().toEqualTypeOf<Promise<User>>();
	});

	it("create requires variables and returns Promise<User>", () => {
		type Fn = Client["users"]["create"];
		expectTypeOf<Parameters<Fn>>().toEqualTypeOf<[CreateUserInput]>();
		expectTypeOf<ReturnType<Fn>>().toEqualTypeOf<Promise<User>>();
	});

	it(".raw changes return type to HttpResponse<R>", () => {
		type RawResult = ReturnType<Client["users"]["raw"]["getAll"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<HttpResponse<User[]>>>();
	});

	it(".raw preserves variables requirement", () => {
		type RawFn = Client["users"]["raw"]["getById"];
		expectTypeOf<Parameters<RawFn>>().toEqualTypeOf<[{ id: number }]>();
		expectTypeOf<ReturnType<RawFn>>().toEqualTypeOf<Promise<HttpResponse<User>>>();
	});

	it("client.raw.group also switches return type", () => {
		type RawResult = ReturnType<Client["raw"]["users"]["getAll"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<HttpResponse<User[]>>>();
	});

	it(".with() returns same typed client", () => {
		type WithClient = ReturnType<Client["with"]>;
		expectTypeOf<WithClient>().toHaveProperty("users");
		expectTypeOf<ReturnType<WithClient["users"]["getAll"]>>().toEqualTypeOf<Promise<User[]>>();
	});

	it(".with() on group preserves raw state", () => {
		type RawGroup = Client["users"]["raw"];
		type WithRawGroup = ReturnType<RawGroup["with"]>;
		type Result = ReturnType<WithRawGroup["getAll"]>;
		expectTypeOf<Result>().toEqualTypeOf<Promise<HttpResponse<User[]>>>();
	});

	it(".with({ stream: true }) resolves to the unread body, or the response around it with .raw", () => {
		/* Checked by the compiler; a streamed call used to keep the parsed body's type. */
		const typeOnly = (client: Client) => {
			expectTypeOf(client.with({ stream: true }).users.getAll).returns.toEqualTypeOf<
				Promise<ReadableStream<Uint8Array>>
			>();
			expectTypeOf(client.raw.with({ stream: true }).users.getAll).returns.toEqualTypeOf<
				Promise<HttpResponse<ReadableStream<Uint8Array>>>
			>();
			expectTypeOf(client.users.with({ stream: true }).getById).returns.toEqualTypeOf<
				Promise<ReadableStream<Uint8Array>>
			>();
		};
		expect(typeOnly).toBeTypeOf("function");
	});

	it(".with() keeps streaming until told otherwise", () => {
		const typeOnly = (client: Client) => {
			expectTypeOf(client.with({ stream: true }).with({ timeout: 1 }).users.getAll).returns.toEqualTypeOf<
				Promise<ReadableStream<Uint8Array>>
			>();
			expectTypeOf(client.with({ stream: true }).with({ stream: false }).users.getAll).returns.toEqualTypeOf<
				Promise<User[]>
			>();
			expectTypeOf(client.with({ timeout: 1 }).users.getAll).returns.toEqualTypeOf<Promise<User[]>>();
		};
		expect(typeOnly).toBeTypeOf("function");
	});
});

// ---- GroupClient type inference ----

describe("GroupClient type inference", () => {
	type UsersClient = GroupClient<typeof usersGroup>;

	it("exposes endpoint methods", () => {
		expectTypeOf<UsersClient["getAll"]>().toBeFunction();
		expectTypeOf<UsersClient["getById"]>().toBeFunction();
	});

	it("has raw accessor", () => {
		expectTypeOf<UsersClient>().toHaveProperty("raw");
	});

	it("has with method", () => {
		expectTypeOf<UsersClient["with"]>().toBeFunction();
	});
});

// ---- structural compatibility ----

describe("structural compatibility", () => {
	it("defineGroup result satisfies group shape expected by executeRequest", () => {
		// executeRequest accesses: group.options, group[methodName]
		const group = usersGroup;
		expectTypeOf(group).toHaveProperty("options");
		expectTypeOf(group).toHaveProperty("getAll");
		expectTypeOf(group.getAll).toHaveProperty("probe");
	});

	it("defineApi result satisfies source shape expected by executeRequest", () => {
		// executeRequest accesses: source.options, source.options.groups
		expectTypeOf(api).toHaveProperty("options");
		expectTypeOf(api.options).toHaveProperty("groups");
		expectTypeOf(api.options).toHaveProperty("baseURL");
	});

	it("a descriptor carries what the endpoint was declared to answer", () => {
		const fn = endpoint.get("").response<User>();
		expectTypeOf<InferResponse<typeof fn>>().toEqualTypeOf<User>();
		expectTypeOf(fn).toHaveProperty("method");
		expectTypeOf(fn).toHaveProperty("path");
	});
});

// ---- FlatClient type inference ----

describe("FlatClient type inference", () => {
	const flatEndpoints = {
		healthCheck: endpoint.get("health").response<{ ok: boolean }>(),
		getUsers: endpoint.get("users").response<User[]>(),
		createUser: endpoint.post("users").variables<CreateUserInput>().response<User>(),
	};

	type FlatEndpoints = typeof flatEndpoints;

	type Client = FlatClient<FlatEndpoints>;

	it("exposes flat endpoint methods", () => {
		expectTypeOf<Client["healthCheck"]>().toBeFunction();
		expectTypeOf<Client["getUsers"]>().toBeFunction();
		expectTypeOf<Client["createUser"]>().toBeFunction();
	});

	it("healthCheck returns Promise<{ ok: boolean }>", () => {
		type Result = ReturnType<Client["healthCheck"]>;
		expectTypeOf<Result>().toEqualTypeOf<Promise<{ ok: boolean }>>();
	});

	it("createUser requires variables", () => {
		type Fn = Client["createUser"];
		expectTypeOf<Parameters<Fn>>().toEqualTypeOf<[CreateUserInput]>();
		expectTypeOf<ReturnType<Fn>>().toEqualTypeOf<Promise<User>>();
	});

	it("has .raw accessor", () => {
		expectTypeOf<Client>().toHaveProperty("raw");
	});

	it("has .with() method", () => {
		expectTypeOf<Client["with"]>().toBeFunction();
	});

	it(".raw changes return type", () => {
		type RawResult = ReturnType<Client["raw"]["getUsers"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<HttpResponse<User[]>>>();
	});

	it("flat method has .raw accessor (method-level)", () => {
		type RawResult = ReturnType<Client["healthCheck"]["raw"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<HttpResponse<{ ok: boolean }>>>();
	});

	it("flat method has .with() (method-level)", () => {
		type WithMethod = ReturnType<Client["healthCheck"]["with"]>;
		expectTypeOf<WithMethod>().toBeFunction();
		type Result = ReturnType<WithMethod>;
		expectTypeOf<Result>().toEqualTypeOf<Promise<{ ok: boolean }>>();
	});

	it("flat method .raw.with() chain works", () => {
		type RawWithMethod = ReturnType<Client["healthCheck"]["raw"]["with"]>;
		expectTypeOf<RawWithMethod>().toBeFunction();
		type Result = ReturnType<RawWithMethod>;
		expectTypeOf<Result>().toEqualTypeOf<Promise<HttpResponse<{ ok: boolean }>>>();
	});
});

// ---- MixedClient type inference ----

describe("MixedClient type inference", () => {
	const rootEndpoints = {
		healthCheck: endpoint.get("health").response<{ ok: boolean }>(),
	};

	type Groups = { users: typeof usersGroup };
	type RootEndpoints = typeof rootEndpoints;
	type Client = MixedClient<Groups, RootEndpoints>;

	it("exposes groups as properties", () => {
		expectTypeOf<Client>().toHaveProperty("users");
	});

	it("exposes flat methods at root level", () => {
		expectTypeOf<Client["healthCheck"]>().toBeFunction();
	});

	it("group methods work normally", () => {
		type UsersGroup = Client["users"];
		expectTypeOf<UsersGroup["getAll"]>().toBeFunction();
		expectTypeOf<ReturnType<UsersGroup["getAll"]>>().toEqualTypeOf<Promise<User[]>>();
	});

	it("flat method returns correct type", () => {
		type Result = ReturnType<Client["healthCheck"]>;
		expectTypeOf<Result>().toEqualTypeOf<Promise<{ ok: boolean }>>();
	});

	it("has .raw and .with()", () => {
		expectTypeOf<Client>().toHaveProperty("raw");
		expectTypeOf<Client["with"]>().toBeFunction();
	});

	it(".raw works on both groups and flat", () => {
		type RawGroupResult = ReturnType<Client["raw"]["users"]["getAll"]>;
		expectTypeOf<RawGroupResult>().toEqualTypeOf<Promise<HttpResponse<User[]>>>();

		type RawFlatResult = ReturnType<Client["raw"]["healthCheck"]>;
		expectTypeOf<RawFlatResult>().toEqualTypeOf<Promise<HttpResponse<{ ok: boolean }>>>();
	});

	it("flat method has .raw and .with() at method level", () => {
		type RawResult = ReturnType<Client["healthCheck"]["raw"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<HttpResponse<{ ok: boolean }>>>();

		type WithMethod = ReturnType<Client["healthCheck"]["with"]>;
		expectTypeOf<WithMethod>().toBeFunction();
	});
});

// ---- InferClient type mapping ----

describe("InferClient type mapping", () => {
	it("maps grouped API to TypedClient", () => {
		type Result = InferClient<typeof api>;
		expectTypeOf<Result>().toHaveProperty("users");
		expectTypeOf<Result>().toHaveProperty("posts");
		expectTypeOf<Result>().toHaveProperty("raw");
		expectTypeOf<Result>().toHaveProperty("with");
	});

	it("maps flat API to FlatClient", () => {
		const flatApi = defineApi({
			baseURL: "https://api.example.com",
			endpoints: {
				healthCheck: endpoint.get("health").response<{ ok: boolean }>(),
			},
		});
		type Result = InferClient<typeof flatApi>;
		expectTypeOf<Result["healthCheck"]>().toBeFunction();
		expectTypeOf<Result>().toHaveProperty("raw");
		expectTypeOf<Result>().toHaveProperty("with");
	});

	it("maps mixed API to MixedClient", () => {
		const mixedApi = defineApi({
			baseURL: "https://api.example.com",
			groups: { users: usersGroup },
			endpoints: {
				healthCheck: endpoint.get("health").response<{ ok: boolean }>(),
			},
		});
		type Result = InferClient<typeof mixedApi>;
		expectTypeOf<Result>().toHaveProperty("users");
		expectTypeOf<Result["healthCheck"]>().toBeFunction();
		expectTypeOf<Result>().toHaveProperty("raw");
		expectTypeOf<Result>().toHaveProperty("with");
	});
});
