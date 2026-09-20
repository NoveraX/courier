import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { defineMiddleware } from "../src/middleware/define";

const UserSchema = z.object({ id: z.string() });

let fetchSpy: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function calledInit(index = 0): RequestInit {
  return (fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit;
}

function header(name: string, index = 0): string | null {
  const { headers } = calledInit(index);
  return headers instanceof Headers
    ? headers.get(name)
    : ((headers as Record<string, string> | undefined)?.[name] ?? null);
}

describe("options an endpoint carries", () => {
  beforeEach(() => {
    /* A Response body reads once, so each call needs its own. */
    fetchSpy = vi.fn(() => Promise.resolve(jsonResponse([{ id: "1" }])));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs middleware given to the base every endpoint is built from", async () => {
    const seen: string[] = [];
    const stamp = defineMiddleware("stamp-base", "wrap", async (ctx, next) => {
      seen.push(ctx.method);
      ctx.headers.set("x-base", "1");
      return next();
    });

    const { endpoint } = courier({ middleware: [stamp] });
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: { getAll: endpoint.get("").response(z.array(UserSchema)) },
        }),
      },
    });

    await createCaller(api).users.getAll();

    expect(seen).toEqual(["getAll"]);
    expect(header("x-base")).toBe("1");
  });

  it("runs middleware added to a single endpoint with .use()", async () => {
    const seen: string[] = [];
    const stamp = defineMiddleware("stamp-endpoint", "wrap", async (ctx, next) => {
      seen.push(ctx.method);
      ctx.headers.set("x-endpoint", "1");
      return next();
    });

    const { endpoint } = courier();
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: {
            getAll: endpoint.get("").use(stamp).response(z.array(UserSchema)),
            other: endpoint.get("other").response(z.array(UserSchema)),
          },
        }),
      },
    });

    const client = createCaller(api);
    await client.users.getAll();
    await client.users.other();

    expect(seen).toEqual(["getAll"]);
    expect(header("x-endpoint", 0)).toBe("1");
    expect(header("x-endpoint", 1)).toBeNull();
  });

  it("applies a timeout declared on the endpoint", async () => {
    const { endpoint } = courier();
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: {
            slow: endpoint.get("slow").timeout(1234).response(z.array(UserSchema)),
          },
        }),
      },
    });

    await createCaller(api).users.slow();

    expect(calledInit().signal).toBeInstanceOf(AbortSignal);
  });
});

describe("policies an endpoint declares", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", (fetchSpy = vi.fn()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries the statuses the endpoint named", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
      .mockResolvedValueOnce(jsonResponse({ id: "1" }));

    const { endpoint } = courier();
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: {
            flaky: endpoint.get("flaky").retry({ attempts: 3, backoff: "fixed", on: [503] }).response(UserSchema),
          },
        }),
      },
    });

    await expect(createCaller(api).users.flaky()).resolves.toEqual({ id: "1" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry a status the endpoint did not name", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: "gone" }, 500));

    const { endpoint } = courier();
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: {
            flaky: endpoint.get("flaky").retry({ attempts: 3, backoff: "fixed", on: [503] }).response(UserSchema),
          },
        }),
      },
    });

    await expect(createCaller(api).users.flaky()).rejects.toMatchObject({ status: 500 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards a header the endpoint allows but the source does not", async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse({ id: "1" })));

    const { endpoint } = courier();
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      allowedHeaders: ["x-source"],
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: {
            me: endpoint.get("me").headers(["x-tenant"]).response(UserSchema),
          },
        }),
      },
    });

    await createCaller(api, {
      context: {
        headers: new Headers({
          "x-tenant": "acme",
          "x-source": "web",
          "x-other": "dropped",
        }),
      },
    }).users.me();

    expect(header("x-tenant")).toBe("acme");
    expect(header("x-source")).toBe("web");
    expect(header("x-other")).toBeNull();
  });

  it("drops inherited middleware where the endpoint opted out", async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse({ id: "1" })));

    const seen: string[] = [];
    const stamp = defineMiddleware("stamp", "wrap", async (ctx, next) => {
      seen.push(ctx.method);
      return next();
    });

    const { endpoint } = courier({ middleware: [stamp] });
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "/users",
          endpoints: {
            inherits: endpoint.get("a").response(UserSchema),
            opted: endpoint.get("b", { inherit: false }).response(UserSchema),
          },
        }),
      },
    });

    const client = createCaller(api);
    await client.users.inherits();
    await client.users.opted();

    expect(seen).toEqual(["inherits"]);
  });
});
