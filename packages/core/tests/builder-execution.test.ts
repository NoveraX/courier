import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCaller } from "../src/caller";
import { courier } from "../src/define/courier";
import { defineApi } from "../src/define/api";
import { defineGroup } from "../src/define/group";

const UserSchema = z.object({ id: z.string(), email: z.string() });
const ById = z.object({ id: z.string() });

let fetchSpy: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function calledUrl(index = 0): string {
  return String(fetchSpy.mock.calls[index]?.[0]);
}

function calledInit(index = 0): RequestInit {
  return (fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit;
}

const api = (() => {
  const base = courier();
  const { query, mutation } = base;

  const users = defineGroup({
    prefix: "/users",
    endpoints: {
      getAll: query.response(z.array(UserSchema)).via((http) => http.get("")),
      getById: query
        .variables(ById)
        .response(UserSchema)
        .via((http, vars) => http.get(":id", vars)),
      create: mutation
        .variables(z.object({ email: z.string() }))
        .response(UserSchema)
        .via((http, vars) => http.post("", vars)),
      search: query
        .variables(z.object({ q: z.string() }))
        .response(z.array(UserSchema))
        .via((http, vars) => http.post("search", vars)),
    },
  });

  return defineApi({ name: "api", baseURL: "https://api.example.com", groups: { users } });
})();

const client = createCaller(api);

describe("endpoints defined with the builder", () => {
  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "1", email: "a@b.c" }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reaches the address the closure described", async () => {
    await client.users.getById({ id: "42" });

    expect(calledUrl()).toBe("https://api.example.com/users/42");
    expect(calledInit().method).toBe("GET");
  });

  it("sends a body for a write", async () => {
    await client.users.create({ email: "new@b.c" });

    expect(calledUrl()).toBe("https://api.example.com/users");
    expect(calledInit().method).toBe("POST");
    expect(JSON.parse(String(calledInit().body))).toEqual({ email: "new@b.c" });
  });

  it("uses the verb the vendor requires even when the endpoint is a read", async () => {
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await client.users.search({ q: "ada" });

    expect(calledUrl()).toBe("https://api.example.com/users/search");
    expect(calledInit().method).toBe("POST");
  });

  it("returns the parsed response to the caller", async () => {
    const user = await client.users.getById({ id: "1" });

    expect(user).toEqual({ id: "1", email: "a@b.c" });
  });

  it("rejects a response the declared schema does not accept", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: 1, email: null }));

    await expect(client.users.getById({ id: "1" })).rejects.toThrow(/Validation failed/);
  });

  it("rejects variables the declared schema does not accept", async () => {

    // @ts-expect-error the declared variables schema rejects a number here
    await expect(client.users.create({ email: 42 })).rejects.toThrow(/Validation failed/);
  });

  it("takes no argument when the endpoint declared no variables", async () => {
    fetchSpy.mockResolvedValue(jsonResponse([]));
    await client.users.getAll();

    expect(calledUrl()).toBe("https://api.example.com/users");
  });
});
