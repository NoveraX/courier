/**
 * Type inference tests for the functional API.
 *
 * These tests verify that TypeScript correctly infers response types,
 * variable types, and endpoint keys through the entire type pipeline.
 * Each test uses `expectTypeOf` for compile-time assertions.
 */
import { describe, expectTypeOf, it } from "vitest";
import { defineApi, defineGroup, endpoint } from "../src/define/index";
import type { Endpoint } from "../src/define/types";
import type { HttpResponse } from "../src/http-client/types";
import type { GroupClient, TypedClient } from "../src/client";
import type { EndpointKey, ResolveEndpoint } from "../src/types";

// ---- test fixtures ----

type User = { id: number; name: string };
type Post = { id: number; title: string };
type CreateUserInput = { name: string; email: string };

const usersGroup = defineGroup({
	prefix: "users",
	endpoints: {
		getAll: endpoint<User[]>()(({ get }) => get()),
		getById: endpoint<User, { id: number }>()(({ get }, vars) => get(":id", vars)),
		create: endpoint<User, CreateUserInput>()(({ post }, vars) => post("", vars)),
	},
});

const postsGroup = defineGroup({
	prefix: "posts",
	endpoints: {
		list: endpoint<Post[]>()(({ get }) => get()),
	},
});

const api = defineApi({
	baseURL: "https://api.example.com",
	groups: { users: usersGroup, posts: postsGroup },
});

// ---- endpoint() type inference ----

describe("endpoint() type inference", () => {
	it("returns Endpoint<R, V> type", () => {
		const fn = endpoint<User[]>()(({ get }) => get());
		expectTypeOf(fn).toMatchTypeOf<Endpoint<User[], undefined>>();
	});

	it("preserves variables type", () => {
		const fn = endpoint<User, { id: number }>()(({ get }, vars) => get(":id", vars));
		expectTypeOf(fn).toMatchTypeOf<Endpoint<User, { id: number }>>();
	});

	it("defaults V to undefined when omitted", () => {
		const fn = endpoint<string>()(({ get }) => get());
		expectTypeOf(fn).toMatchTypeOf<Endpoint<string, undefined>>();
	});
});

// ---- defineGroup() type inference ----

describe("defineGroup() type inference", () => {
	it("exposes endpoint functions as typed properties", () => {
		expectTypeOf(usersGroup.getAll).toMatchTypeOf<Endpoint<User[], undefined>>();
		expectTypeOf(usersGroup.getById).toMatchTypeOf<Endpoint<User, { id: number }>>();
		expectTypeOf(usersGroup.create).toMatchTypeOf<Endpoint<User, CreateUserInput>>();
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

// ---- EndpointKey resolution ----

describe("EndpointKey type resolution", () => {
	type ApiType = typeof api;

	it("resolves grouped endpoint keys as group:method", () => {
		type Keys = EndpointKey<ApiType>;
		expectTypeOf<"users:getAll">().toMatchTypeOf<Keys>();
		expectTypeOf<"users:getById">().toMatchTypeOf<Keys>();
		expectTypeOf<"users:create">().toMatchTypeOf<Keys>();
		expectTypeOf<"posts:list">().toMatchTypeOf<Keys>();
	});

	it("rejects invalid endpoint keys", () => {
		type Keys = EndpointKey<ApiType>;
		expectTypeOf<"users:nonexistent">().not.toMatchTypeOf<Keys>();
		expectTypeOf<"unknown:getAll">().not.toMatchTypeOf<Keys>();
	});
});

// ---- ResolveEndpoint type resolution ----

describe("ResolveEndpoint type resolution", () => {
	type ApiType = typeof api;

	it("resolves users:getAll to Endpoint<User[], undefined>", () => {
		type Resolved = ResolveEndpoint<ApiType, "users:getAll">;
		expectTypeOf<Resolved>().toMatchTypeOf<Endpoint<User[], undefined>>();
	});

	it("resolves users:getById to Endpoint<User, { id: number }>", () => {
		type Resolved = ResolveEndpoint<ApiType, "users:getById">;
		expectTypeOf<Resolved>().toMatchTypeOf<Endpoint<User, { id: number }>>();
	});

	it("resolves users:create to Endpoint<User, CreateUserInput>", () => {
		type Resolved = ResolveEndpoint<ApiType, "users:create">;
		expectTypeOf<Resolved>().toMatchTypeOf<Endpoint<User, CreateUserInput>>();
	});

	it("resolves posts:list to Endpoint<Post[], undefined>", () => {
		type Resolved = ResolveEndpoint<ApiType, "posts:list">;
		expectTypeOf<Resolved>().toMatchTypeOf<Endpoint<Post[], undefined>>();
	});
});

// ---- TypedClient type inference ----

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

	it(".raw changes return type to Partial<HttpResponse<R>>", () => {
		type RawResult = ReturnType<Client["users"]["raw"]["getAll"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<Partial<HttpResponse<User[]>>>>();
	});

	it(".raw preserves variables requirement", () => {
		type RawFn = Client["users"]["raw"]["getById"];
		expectTypeOf<Parameters<RawFn>>().toEqualTypeOf<[{ id: number }]>();
		expectTypeOf<ReturnType<RawFn>>().toEqualTypeOf<Promise<Partial<HttpResponse<User>>>>();
	});

	it("client.raw.group also switches return type", () => {
		type RawResult = ReturnType<Client["raw"]["users"]["getAll"]>;
		expectTypeOf<RawResult>().toEqualTypeOf<Promise<Partial<HttpResponse<User[]>>>>();
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
		expectTypeOf<Result>().toEqualTypeOf<Promise<Partial<HttpResponse<User[]>>>>();
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
		expectTypeOf(group.getAll).toBeFunction();
	});

	it("defineApi result satisfies source shape expected by executeRequest", () => {
		// executeRequest accesses: source.options, source.options.groups
		expectTypeOf(api).toHaveProperty("options");
		expectTypeOf(api.options).toHaveProperty("groups");
		expectTypeOf(api.options).toHaveProperty("baseURL");
	});

	it("endpoint return matches HttpResponse shape", async () => {
		const fn = endpoint<User>()(({ get }) => get());
		// Endpoint<R, V> returns HttpResponse<R> | Promise<HttpResponse<R>>
		type FnReturn = Awaited<ReturnType<typeof fn>>;
		expectTypeOf<FnReturn>().toMatchTypeOf<HttpResponse<User>>();
	});
});
