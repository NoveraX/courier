import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCaller } from "../src/caller";
import { courier } from "../src/define/courier";
import { defineApi } from "../src/define/api";
import { defineGroup } from "../src/define/group";
import { defineMiddleware } from "../src/middleware/index";
import { executeRequest } from "../src/utils/execute";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

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
  const { endpoint } = base;

  const users = defineGroup({
    prefix: "/users",
    endpoints: {
      getAll: endpoint.get("").response(z.array(UserSchema)),
      getById: endpoint.get(":id").variables(ById).response(UserSchema),
      create: endpoint.post("").variables(z.object({ email: z.string() })).response(UserSchema),
      search: endpoint.post("search").variables(z.object({ q: z.string() })).response(z.array(UserSchema)).reads(),
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

describe("proxy routing follows the head", () => {
  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(jsonResponse([{ id: "1", email: "a@b.c" }]));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves a query over a GET proxy request", async () => {
    const result = await executeRequest(
      { api },
      { source: "api", group: "users", method: "getAll" },
      { proxyMethod: "GET" },
    );

    expect(result).toEqual([{ id: "1", email: "a@b.c" }]);
  });

  it("refuses a mutation over a GET proxy request", async () => {
    await expect(
      executeRequest(
        { api },
        { source: "api", group: "users", method: "create", variables: { email: "a@b.c" } },
        { proxyMethod: "GET" },
      ),
    ).rejects.toMatchObject({ status: 405 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves a mutation over a POST proxy request", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: "1", email: "a@b.c" }));

    const result = await executeRequest(
      { api },
      { source: "api", group: "users", method: "create", variables: { email: "a@b.c" } },
      { proxyMethod: "POST" },
    );

    expect(result).toEqual({ id: "1", email: "a@b.c" });
  });

  it("serves a query over GET even when the vendor requires a POST upstream", async () => {
    const result = await executeRequest(
      { api },
      { source: "api", group: "users", method: "search", variables: { q: "a" } },
      { proxyMethod: "GET" },
    );

    expect(result).toEqual([{ id: "1", email: "a@b.c" }]);
    expect(calledInit().method).toBe("POST");
  });
});

describe("an endpoint that does not inherit its base's middleware", () => {
  let upstream: Upstream | undefined;

  /* The suites above replace fetch; these talk to a real upstream. */
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    await upstream?.close();
    upstream = undefined;
  });

  function recording(ran: string[], name: string) {
    return defineMiddleware(name, "before", () => {
      ran.push(name);
    });
  }

  it("still runs its own middleware, named after the verb", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
    const ran: string[] = [];
    const base = courier({ middleware: [recording(ran, "base")] });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [recording(ran, "source")],
        endpoints: {
          login: base.endpoint.post("login", { inherit: false }).use(recording(ran, "own")),
        },
      }),
    );

    await expect(client.login()).resolves.toEqual({ ok: true });

    expect(ran).toEqual(["source", "own"]);
  });

  it("still runs its own middleware, named before the verb", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
    const ran: string[] = [];
    const vendor = courier({ middleware: [recording(ran, "base")] });
    const admin = vendor.extend({ middleware: [recording(ran, "extended")] });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        endpoints: {
          login: admin.endpoint.use(recording(ran, "own")).post("login", { inherit: false }),
        },
      }),
    );

    await expect(client.login()).resolves.toEqual({ ok: true });

    expect(ran).toEqual(["own"]);
    expect(upstream.seen).toHaveLength(1);
  });
});
