import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { z } from "zod";
import { defineApi, defineGroup, endpoint } from "../src/define/index";
import { ENDPOINT_SCHEMA, ValidationError, isValidationError, validateSchema } from "../src/validation";
import { executeRequest } from "../src/utils/createRequest";

// ---- mock fetch ----

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200, headers = new Headers()) {
	return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

beforeEach(() => {
	fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse({}));
	vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---- ValidationError ----

describe("ValidationError", () => {
	it("has correct name and properties", () => {
		const error = new ValidationError("response", [
			{ message: "Expected string, received number" },
		]);

		expect(error.name).toBe("ValidationError");
		expect(error.target).toBe("response");
		expect(error.issues).toHaveLength(1);
		expect(error.message).toContain("response");
		expect(error.message).toContain("Expected string, received number");
	});

	it("joins multiple issue messages", () => {
		const error = new ValidationError("variables", [
			{ message: "Required" },
			{ message: "Invalid type" },
		]);

		expect(error.message).toContain("Required");
		expect(error.message).toContain("Invalid type");
	});

	it("is an instance of Error", () => {
		const error = new ValidationError("response", [{ message: "bad" }]);
		expect(error).toBeInstanceOf(Error);
	});
});

describe("isValidationError", () => {
	it("returns true for ValidationError", () => {
		expect(isValidationError(new ValidationError("response", []))).toBe(true);
	});

	it("returns false for other errors", () => {
		expect(isValidationError(new Error("test"))).toBe(false);
		expect(isValidationError(null)).toBe(false);
		expect(isValidationError("string")).toBe(false);
	});
});

// ---- validateSchema ----

describe("validateSchema", () => {
	it("returns parsed value on valid input (Zod)", async () => {
		const schema = z.object({ name: z.string() });
		const result = await validateSchema(schema, { name: "Alice" }, "response");
		expect(result).toEqual({ name: "Alice" });
	});

	it("throws ValidationError on invalid input (Zod)", async () => {
		const schema = z.object({ name: z.string() });
		await expect(validateSchema(schema, { name: 42 }, "response")).rejects.toThrow(ValidationError);
	});

	it("returns parsed value on valid input (Valibot)", async () => {
		const schema = v.object({ name: v.string() });
		const result = await validateSchema(schema, { name: "Bob" }, "variables");
		expect(result).toEqual({ name: "Bob" });
	});

	it("throws ValidationError on invalid input (Valibot)", async () => {
		const schema = v.object({ name: v.string() });
		await expect(validateSchema(schema, { name: 123 }, "variables")).rejects.toThrow(ValidationError);
	});

	it("includes target in the error", async () => {
		const schema = z.string();
		try {
			await validateSchema(schema, 42, "variables");
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).target).toBe("variables");
		}
	});

	it("includes issues array", async () => {
		const schema = z.object({ a: z.string(), b: z.number() });
		try {
			await validateSchema(schema, { a: 1, b: "x" }, "response");
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).issues.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("applies transformations (Zod coerce)", async () => {
		const schema = z.coerce.number();
		const result = await validateSchema(schema, "42", "variables");
		expect(result).toBe(42);
	});
});

// ---- endpoint() with schema ----

describe("endpoint with schema config", () => {
	it("attaches schema metadata to endpoint function (Zod)", () => {
		const responseSchema = z.object({ id: z.number(), name: z.string() });
		const fn = endpoint({ response: responseSchema })(({ get }) => get());

		const meta = (fn as any)[ENDPOINT_SCHEMA];
		expect(meta).toBeDefined();
		expect(meta.response).toBe(responseSchema);
		expect(meta.variables).toBeUndefined();
	});

	it("attaches both response and variables schemas", () => {
		const responseSchema = z.object({ id: z.number() });
		const varsSchema = z.object({ name: z.string() });
		const fn = endpoint({ response: responseSchema, variables: varsSchema })(
			({ post }, vars) => post("", vars),
		);

		const meta = (fn as any)[ENDPOINT_SCHEMA];
		expect(meta.response).toBe(responseSchema);
		expect(meta.variables).toBe(varsSchema);
	});

	it("attaches variables schema only", () => {
		const varsSchema = z.object({ email: z.string() });
		const fn = endpoint({ variables: varsSchema })(({ post }, vars) => post("", vars));

		const meta = (fn as any)[ENDPOINT_SCHEMA];
		expect(meta.response).toBeUndefined();
		expect(meta.variables).toBe(varsSchema);
	});

	it("does not attach metadata when called without config", () => {
		const fn = endpoint<string>()(({ get }) => get());
		const meta = (fn as any)[ENDPOINT_SCHEMA];
		expect(meta).toBeUndefined();
	});

	it("works with Valibot schemas", () => {
		const responseSchema = v.object({ id: v.number(), name: v.string() });
		const fn = endpoint({ response: responseSchema })(({ get }) => get());

		const meta = (fn as any)[ENDPOINT_SCHEMA];
		expect(meta.response).toBe(responseSchema);
	});
});

// ---- integration: executeRequest with validation ----

describe("integration: response validation", () => {
	it("passes when response matches schema (Zod)", async () => {
		const UserSchema = z.object({ id: z.number(), name: z.string() });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: endpoint({ response: z.array(UserSchema) })(({ get }) => get()),
					},
				}),
			},
		});

		const users = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
		fetchSpy.mockResolvedValue(mockFetchResponse(users));

		const result = await executeRequest({ api }, {
			source: "api",
			group: "users",
			method: "getAll",
		});

		expect(result).toEqual(users);
	});

	it("throws ValidationError when response doesn't match schema", async () => {
		const UserSchema = z.object({ id: z.number(), name: z.string() });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						getAll: endpoint({ response: z.array(UserSchema) })(({ get }) => get()),
					},
				}),
			},
		});

		// Return malformed data (name is a number instead of string)
		fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: 42 }]));

		try {
			await executeRequest({ api }, {
				source: "api",
				group: "users",
				method: "getAll",
			});
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).target).toBe("response");
		}
	});

	it("passes with Valibot response schema", async () => {
		const PostSchema = v.object({ id: v.number(), title: v.string() });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				posts: defineGroup({
					prefix: "posts",
					endpoints: {
						list: endpoint({ response: v.array(PostSchema) })(({ get }) => get()),
					},
				}),
			},
		});

		const posts = [{ id: 1, title: "Hello" }];
		fetchSpy.mockResolvedValue(mockFetchResponse(posts));

		const result = await executeRequest({ api }, {
			source: "api",
			group: "posts",
			method: "list",
		});

		expect(result).toEqual(posts);
	});
});

describe("integration: variables validation", () => {
	it("passes when variables match schema", async () => {
		const CreateUserSchema = z.object({ name: z.string(), email: z.string() });
		const UserSchema = z.object({ id: z.number(), name: z.string(), email: z.string() });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						create: endpoint({ response: UserSchema, variables: CreateUserSchema })(
							({ post }, vars) => post("", vars),
						),
					},
				}),
			},
		});

		const newUser = { id: 1, name: "Alice", email: "alice@test.com" };
		fetchSpy.mockResolvedValue(mockFetchResponse(newUser, 201));

		const result = await executeRequest({ api }, {
			source: "api",
			group: "users",
			method: "create",
			variables: { name: "Alice", email: "alice@test.com" },
		});

		expect(result).toEqual(newUser);
	});

	it("throws ValidationError when variables are invalid", async () => {
		const CreateUserSchema = z.object({ name: z.string(), email: z.string() });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				users: defineGroup({
					prefix: "users",
					endpoints: {
						create: endpoint({ variables: CreateUserSchema })(
							({ post }, vars) => post("", vars),
						),
					},
				}),
			},
		});

		try {
			await executeRequest({ api }, {
				source: "api",
				group: "users",
				method: "create",
				variables: { name: 123 }, // name should be string, email is missing
			});
			expect.fail("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).target).toBe("variables");
		}
	});

	it("validates variables before the request is sent", async () => {
		const VarsSchema = z.object({ id: z.number() });

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				items: defineGroup({
					prefix: "items",
					endpoints: {
						get: endpoint({ variables: VarsSchema })(({ get }, vars) => get(":id", vars)),
					},
				}),
			},
		});

		try {
			await executeRequest({ api }, {
				source: "api",
				group: "items",
				method: "get",
				variables: { id: "not-a-number" },
			});
			expect.fail("should have thrown");
		} catch {
			// HTTP request should never have been made
			expect(fetchSpy).not.toHaveBeenCalled();
		}
	});
});

describe("integration: endpoints without schema", () => {
	it("skips validation entirely when no schema is attached", async () => {
		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				misc: defineGroup({
					prefix: "misc",
					endpoints: {
						ping: endpoint<string>()(({ get }) => get("ping")),
					},
				}),
			},
		});

		fetchSpy.mockResolvedValue(mockFetchResponse("pong"));

		const result = await executeRequest({ api }, {
			source: "api",
			group: "misc",
			method: "ping",
		});

		expect(result).toBe("pong");
	});
});

describe("integration: schema transforms", () => {
	it("applies Zod transforms to response data", async () => {
		const DateSchema = z.object({
			createdAt: z.coerce.date(),
		});

		const api = defineApi({
			baseURL: "https://api.example.com",
			groups: {
				items: defineGroup({
					prefix: "items",
					endpoints: {
						get: endpoint({ response: DateSchema })(({ get }) => get()),
					},
				}),
			},
		});

		fetchSpy.mockResolvedValue(mockFetchResponse({ createdAt: "2024-01-01T00:00:00Z" }));

		const result = await executeRequest({ api }, {
			source: "api",
			group: "items",
			method: "get",
		});

		expect((result as any).createdAt).toBeInstanceOf(Date);
	});
});
