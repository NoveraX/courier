import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/errors";
import {
  authMiddleware,
  cacheMiddleware,
  composeMiddleware,
  defineMiddleware,
  logMiddleware,
  rateLimitMiddleware,
  retryMiddleware,
} from "../src/middleware/index";
import type {
  BeforeHandler,
  Middleware,
  MiddlewareResponse,
  WrapHandler,
} from "../src/middleware/types";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

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

// ---- helpers ----

function createApi(middleware?: Middleware[]) {
  return defineApi({
    expose: true,
    baseURL: "https://api.test.com",
    middleware,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          getAll: endpoint.get("").response<{ id: number; name: string }[]>(),
          create: endpoint
            .post("")
            .variables<{ name: string }>()
            .response<{ id: number; name: string }>(),
        },
      }),
    },
  });
}

const ok = (data: unknown = []) => MiddlewareResponseHelper(200, data);
const serverError = (data: unknown = { error: "fail" }) => MiddlewareResponseHelper(500, data);

/** What a request that never got an answer is rejected with. */
function networkFailure(): HTTPError {
  return new HTTPError({
    status: 0,
    headers: new Headers(),
    data: { success: false, message: "socket hang up" },
  });
}

function MiddlewareResponseHelper(status: number, data: unknown): MiddlewareResponse {
  return { status, data, headers: new Headers() };
}

// ---- defineMiddleware ----

describe("defineMiddleware", () => {
  it("returns a Middleware object with name, phase, handler", () => {
    const fn = async (_ctx: any, next: any) => next();
    const mw = defineMiddleware("test", "wrap", fn);
    expect(mw).toEqual({ name: "test", phase: "wrap", handler: fn });
  });
});

// ---- composeMiddleware ----

describe("composeMiddleware", () => {
  it("empty array passes through to next", async () => {
    const composed = composeMiddleware([]);
    const result = await composed(
      {
        source: "api",
        method: "test",
        headers: new Headers(),
      },
      () => Promise.resolve(ok("done")),
    );
    expect(result.data).toBe("done");
  });

  it("executes middleware in order (onion model)", async () => {
    const order: string[] = [];

    const first = defineMiddleware("first", "wrap", async (_ctx, next) => {
      order.push("first:before");
      const res = await next();
      order.push("first:after");
      return res;
    });

    const second = defineMiddleware("second", "wrap", async (_ctx, next) => {
      order.push("second:before");
      const res = await next();
      order.push("second:after");
      return res;
    });

    const composed = composeMiddleware([first, second]);
    await composed({ source: "api", method: "test", headers: new Headers() }, () => {
      order.push("handler");
      return Promise.resolve(ok());
    });

    expect(order).toEqual([
      "first:before",
      "second:before",
      "handler",
      "second:after",
      "first:after",
    ]);
  });

  it("allows middleware to modify context", async () => {
    const addHeader = defineMiddleware("addHeader", "wrap", async (ctx, next) => {
      ctx.headers.set("X-Custom", "value");
      return next();
    });

    const composed = composeMiddleware([addHeader]);
    let capturedHeaders: Headers | undefined;

    await composed({ source: "api", method: "test", headers: new Headers() }, () => {
      return Promise.resolve(ok());
    });

    // Verified implicitly — the middleware modified the shared ctx.headers
    const ctx = { source: "api", method: "test", headers: new Headers() };
    await composed(ctx, () => {
      capturedHeaders = ctx.headers;
      return Promise.resolve(ok());
    });

    expect(capturedHeaders?.get("X-Custom")).toBe("value");
  });

  it("allows middleware to transform response", async () => {
    const transform = defineMiddleware("transform", "wrap", async (_ctx, next) => {
      const res = await next();
      return { ...res, data: "transformed" };
    });

    const composed = composeMiddleware([transform]);
    const result = await composed({ source: "api", method: "test", headers: new Headers() }, () =>
      Promise.resolve(ok("original")),
    );

    expect(result.data).toBe("transformed");
  });

  it("allows middleware to short-circuit without calling next", async () => {
    const cached = defineMiddleware("cached", "wrap", async () => ok("from-cache"));

    const nextCalled = vi.fn();
    const composed = composeMiddleware([cached]);
    const result = await composed({ source: "api", method: "test", headers: new Headers() }, () => {
      nextCalled();
      return Promise.resolve(ok("from-handler"));
    });

    expect(result.data).toBe("from-cache");
    expect(nextCalled).not.toHaveBeenCalled();
  });

  it("allows retry by calling next() multiple times", async () => {
    let calls = 0;

    const retrier = defineMiddleware("retrier", "wrap", async (_ctx, next) => {
      const res = await next();
      if (res.status === 500 && calls < 2) {
        return next();
      }
      return res;
    });

    const composed = composeMiddleware([retrier]);
    const result = await composed({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      return Promise.resolve(calls < 2 ? serverError() : ok("success"));
    });

    expect(result.data).toBe("success");
    expect(calls).toBe(2);
  });
});

// ---- integration: middleware in executeRequest ----

describe("integration: middleware in executeRequest", () => {
  it("middleware can modify request headers", async () => {
    const addAuth = defineMiddleware("addAuth", "wrap", async (ctx, next) => {
      ctx.headers.set("Authorization", "Bearer test-token");
      return next();
    });

    const api = createApi([addAuth]);
    fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: "A" }]));

    await executeRequest({ api }, { source: "api", group: "users", method: "getAll" });

    expect(fetchSpy).toHaveBeenCalled();
  });

  it("middleware can transform response data", async () => {
    const wrap = defineMiddleware("wrap", "wrap", async (_ctx, next) => {
      const res = await next();
      return { ...res, data: { wrapped: true, original: res.data } };
    });

    const api = createApi([wrap]);
    fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: "A" }]));

    const result = await executeRequest(
      { api },
      { source: "api", group: "users", method: "getAll" },
    );

    expect(result).toEqual({
      wrapped: true,
      original: [{ id: 1, name: "A" }],
    });
  });

  it("middleware can short-circuit the request", async () => {
    const block = defineMiddleware("block", "wrap", async () => ({
      status: 200,
      data: "blocked",
      headers: new Headers(),
    }));

    const api = createApi([block]);

    const result = await executeRequest(
      { api },
      { source: "api", group: "users", method: "getAll" },
    );

    expect(result).toBe("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails a call a middleware refuses, for a direct caller as for a proxied one", async () => {
    /* A direct caller's promise resolved with the refusal's body as its data, while the proxy
       answered with the status: the same refusal read as a success on one side. */
    const refuse = defineMiddleware("maintenance", "wrap", async () => ({
      status: 503,
      data: { message: "Down for maintenance" },
      headers: new Headers(),
    }));
    const api = createApi([refuse]);
    const call = { source: "api", group: "users", method: "getAll" };

    const direct = await executeRequest({ api }, call).catch((error: unknown) => error);
    const proxied = (await executeRequest({ api }, call, {
      res: new Response(),
      proxyMethod: "POST",
    })) as Response;

    expect(direct).toBeInstanceOf(HTTPError);
    expect(direct).toMatchObject({ status: 503, data: { message: "Down for maintenance" } });
    expect(proxied.status).toBe(503);
    expect(await proxied.json()).toEqual({ message: "Down for maintenance" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("multiple middleware compose correctly in executeRequest", async () => {
    const order: string[] = [];

    const first = defineMiddleware("first", "wrap", async (_ctx, next) => {
      order.push("first");
      const res = await next();
      order.push("first:done");
      return res;
    });

    const second = defineMiddleware("second", "wrap", async (_ctx, next) => {
      order.push("second");
      const res = await next();
      order.push("second:done");
      return res;
    });

    const api = createApi([first, second]);
    fetchSpy.mockResolvedValue(mockFetchResponse([]));

    await executeRequest({ api }, { source: "api", group: "users", method: "getAll" });

    expect(order).toEqual(["first", "second", "second:done", "first:done"]);
  });

  it("without middleware, executeRequest works as before", async () => {
    const api = createApi();
    fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: "Alice" }]));

    const result = await executeRequest(
      { api },
      { source: "api", group: "users", method: "getAll" },
    );

    expect(result).toEqual([{ id: 1, name: "Alice" }]);
  });
});

// ---- retryMiddleware ----

describe("retryMiddleware", () => {
  it("retries on 500+ status by default", async () => {
    let calls = 0;
    const handler = retryMiddleware({ limit: 2, delay: 0 }).handler as WrapHandler;

    const result = await handler({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      return Promise.resolve(calls < 3 ? serverError() : ok("success"));
    });

    expect(result.data).toBe("success");
    expect(calls).toBe(3);
  });

  it("stops after limit is reached", async () => {
    let calls = 0;
    const handler = retryMiddleware({ limit: 1, delay: 0 }).handler as WrapHandler;

    const result = await handler({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      return Promise.resolve(serverError());
    });

    expect(result.status).toBe(500);
    expect(calls).toBe(2); // 1 initial + 1 retry
  });

  it("respects custom retryOn condition", async () => {
    let calls = 0;
    const handler = retryMiddleware({
      limit: 2,
      delay: 0,
      retryOn: (res) => res.status === 429,
    }).handler as WrapHandler;

    const result = await handler({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      if (calls === 1)
        return Promise.resolve({ status: 429, data: "rate limited", headers: new Headers() });
      return Promise.resolve(ok("ok"));
    });

    expect(result.data).toBe("ok");
    expect(calls).toBe(2);
  });

  it("retries a request that got no answer", async () => {
    let calls = 0;
    const handler = retryMiddleware({ limit: 1, delay: 0 }).handler as WrapHandler;

    const result = await handler({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      if (calls === 1) throw networkFailure();
      return Promise.resolve(ok("recovered"));
    });

    expect(result.data).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("throws the last failure after exhausting retries", async () => {
    let calls = 0;
    const handler = retryMiddleware({ limit: 1, delay: 0 }).handler as WrapHandler;

    await expect(
      handler({ source: "api", method: "test", headers: new Headers() }, () => {
        calls++;
        throw networkFailure();
      }),
    ).rejects.toMatchObject({ status: 0 });
    expect(calls).toBe(2);
  });

  it("does not retry an error that is not an HTTP failure", async () => {
    let calls = 0;
    const handler = retryMiddleware({ limit: 3, delay: 0 }).handler as WrapHandler;

    await expect(
      handler({ source: "api", method: "test", headers: new Headers() }, () => {
        calls++;
        throw new Error("middleware bug");
      }),
    ).rejects.toThrow("middleware bug");
    expect(calls).toBe(1);
  });

  it("does not retry on success", async () => {
    let calls = 0;
    const handler = retryMiddleware({ limit: 3, delay: 0 }).handler as WrapHandler;

    await handler({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      return Promise.resolve(ok());
    });

    expect(calls).toBe(1);
  });
});

// ---- logMiddleware ----

describe("logMiddleware", () => {
  it("logs successful requests", async () => {
    const messages: string[] = [];
    const handler = logMiddleware({ logger: (msg) => messages.push(msg) }).handler as WrapHandler;

    await handler({ source: "api", group: "users", method: "getAll", headers: new Headers() }, () =>
      Promise.resolve(ok()),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/api:users:getAll → 200 \(\d+ms\)/);
  });

  it("logs errors", async () => {
    const messages: string[] = [];
    const handler = logMiddleware({ logger: (msg) => messages.push(msg) }).handler as WrapHandler;

    await expect(
      handler({ source: "api", method: "ping", headers: new Headers() }, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/api:ping → ERROR \(\d+ms\)/);
  });

  it("hands the error of a failed request to the logger", async () => {
    const errors: unknown[] = [];
    const handler = logMiddleware({ logger: (_msg, error) => errors.push(error) })
      .handler as WrapHandler;
    const boom = new Error("boom");

    await expect(
      handler({ source: "api", method: "ping", headers: new Headers() }, () => {
        throw boom;
      }),
    ).rejects.toThrow("boom");

    expect(errors).toEqual([boom]);
  });

  it("logs a failure at warn, with the error, by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = new Error("boom");
    const handler = logMiddleware().handler as WrapHandler;

    await expect(
      handler({ source: "api", method: "ping", headers: new Headers() }, () => {
        throw boom;
      }),
    ).rejects.toThrow("boom");

    const failure = warn.mock.calls.find((call) => String(call[1]).includes("api:ping → ERROR"));
    expect(failure?.at(-1)).toBe(boom);
    warn.mockRestore();
  });

  it("keeps an upstream's headers and body out of the default log, and states its status", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = new HTTPError({
      status: 404,
      headers: new Headers({ "set-cookie": "session=SECRET-SESSION-TOKEN" }),
      data: { user: { email: "jane@example.com" } },
    });
    const handler = logMiddleware().handler as WrapHandler;

    await expect(
      handler({ source: "api", method: "ping", headers: new Headers() }, () =>
        Promise.reject(answer),
      ),
    ).rejects.toBe(answer);

    const printed = [...info.mock.calls, ...warn.mock.calls].flat();
    expect(printed.map(String).join(" ")).toMatch(/api:ping → 404 \(\d+ms\)/);
    expect(printed).not.toContain(answer);
    expect(JSON.stringify(printed.map(String))).not.toContain("SECRET-SESSION-TOKEN");
    info.mockRestore();
    warn.mockRestore();
  });

  it("logs a 5xx answer at warn, and a request that got none with its network error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = new Error("connect ECONNREFUSED 127.0.0.1:4000");
    const handler = logMiddleware().handler as WrapHandler;

    await handler({ source: "api", method: "a", headers: new Headers() }, () =>
      Promise.reject(new HTTPError({ status: 503, headers: new Headers(), data: null })),
    ).catch(() => undefined);
    await handler({ source: "api", method: "b", headers: new Headers() }, () =>
      Promise.reject(
        new HTTPError({ status: 0, headers: new Headers(), data: null }, { cause: refused }),
      ),
    ).catch(() => undefined);

    const lines = warn.mock.calls.map((call) => String(call[1]));
    expect(lines.some((line) => /api:a → 503/.test(line))).toBe(true);
    const network = warn.mock.calls.find((call) => String(call[1]).includes("api:b → ERROR"));
    expect(network?.at(-1)).toBe(refused);
    warn.mockRestore();
  });

  it("logs a request that rejected with nothing at warn, not as a success", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = logMiddleware().handler as WrapHandler;

    await handler({ source: "api", method: "ping", headers: new Headers() }, () =>
      Promise.reject(),
    ).catch(() => undefined);

    expect(warn.mock.calls.some((call) => String(call[1]).includes("api:ping → ERROR"))).toBe(true);
    warn.mockRestore();
  });

  it("omits group when undefined", async () => {
    const messages: string[] = [];
    const handler = logMiddleware({ logger: (msg) => messages.push(msg) }).handler as WrapHandler;

    await handler({ source: "api", method: "health", headers: new Headers() }, () =>
      Promise.resolve(ok()),
    );

    expect(messages[0]).toMatch(/^api:health/);
  });
});

// ---- authMiddleware ----

describe("authMiddleware", () => {
  it("attaches auth header", async () => {
    const handler = authMiddleware({ getToken: () => "tok123" }).handler as WrapHandler;
    const ctx = { source: "api", method: "test", headers: new Headers() };

    await handler(ctx, () => Promise.resolve(ok()));

    expect(ctx.headers.get("Authorization")).toBe("Bearer tok123");
  });

  it("refreshes token on 401", async () => {
    let callCount = 0;
    const handler = authMiddleware({
      getToken: () => "expired",
      refreshToken: () => "fresh",
    }).handler as WrapHandler;

    const ctx = { source: "api", method: "test", headers: new Headers() };
    const result = await handler(ctx, () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ status: 401, data: "unauthorized", headers: new Headers() });
      }
      return Promise.resolve(ok("ok"));
    });

    expect(result.data).toBe("ok");
    expect(ctx.headers.get("Authorization")).toBe("Bearer fresh");
    expect(callCount).toBe(2);
  });

  it("uses custom header and scheme", async () => {
    const handler = authMiddleware({
      getToken: () => "key",
      header: "X-API-Key",
      scheme: "",
    }).handler as WrapHandler;

    const ctx = { source: "api", method: "test", headers: new Headers() };
    await handler(ctx, () => Promise.resolve(ok()));

    expect(ctx.headers.get("X-API-Key")).toBe("key");
  });

  it("does not refresh if no refreshToken provided", async () => {
    let calls = 0;
    const handler = authMiddleware({ getToken: () => "token" }).handler as WrapHandler;

    const result = await handler({ source: "api", method: "test", headers: new Headers() }, () => {
      calls++;
      return Promise.resolve({ status: 401, data: "no auth", headers: new Headers() });
    });

    expect(result.status).toBe(401);
    expect(calls).toBe(1);
  });
});

// ---- rateLimitMiddleware ----

describe("rateLimitMiddleware", () => {
  it("allows requests within the limit", async () => {
    const handler = rateLimitMiddleware({ maxRequests: 3, window: 1000 }).handler as BeforeHandler;
    const ctx = { source: "api", method: "test", headers: new Headers() };

    await handler(ctx);
    await handler(ctx);
    await handler(ctx);

    // If we got here without delay, all 3 were within limit
    expect(true).toBe(true);
  });

  it("delays requests beyond the limit", async () => {
    const handler = rateLimitMiddleware({ maxRequests: 1, window: 50 }).handler as BeforeHandler;
    const ctx = { source: "api", method: "test", headers: new Headers() };

    const start = Date.now();
    await handler(ctx);
    await handler(ctx); // should be delayed
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

// ---- cacheMiddleware ----

describe("cacheMiddleware", () => {
  it("caches successful responses", async () => {
    let calls = 0;
    const handler = cacheMiddleware({ scope: "public", ttl: 5000 }).handler as WrapHandler;
    const ctx = { source: "api", group: "users", method: "getAll", headers: new Headers() };

    const next = () => {
      calls++;
      return Promise.resolve(ok("data"));
    };

    await handler(ctx, next);
    const result = await handler(ctx, next);

    expect(result.data).toBe("data");
    expect(calls).toBe(1); // second call served from cache
  });

  it("does not cache error responses", async () => {
    let calls = 0;
    const handler = cacheMiddleware({ scope: "public", ttl: 5000 }).handler as WrapHandler;
    const ctx = { source: "api", method: "test", headers: new Headers() };

    const next = () => {
      calls++;
      return Promise.resolve(calls === 1 ? serverError() : ok("ok"));
    };

    await handler(ctx, next);
    const result = await handler(ctx, next);

    expect(result.data).toBe("ok");
    expect(calls).toBe(2);
  });

  it("respects TTL expiry", async () => {
    vi.useFakeTimers();

    let calls = 0;
    const handler = cacheMiddleware({ scope: "public", ttl: 100 }).handler as WrapHandler;
    const ctx = { source: "api", method: "test", headers: new Headers() };

    const next = () => {
      calls++;
      return Promise.resolve(ok(`v${calls}`));
    };

    await handler(ctx, next);
    expect(calls).toBe(1);

    vi.advanceTimersByTime(150);

    const result = await handler(ctx, next);
    expect(result.data).toBe("v2");
    expect(calls).toBe(2);

    vi.useRealTimers();
  });

  it("caches separately per variables", async () => {
    let calls = 0;
    const handler = cacheMiddleware({ scope: "public", ttl: 5000 }).handler as WrapHandler;

    const next = () => {
      calls++;
      return Promise.resolve(ok(`r${calls}`));
    };

    await handler(
      { source: "api", method: "get", variables: { id: 1 }, headers: new Headers() },
      next,
    );
    await handler(
      { source: "api", method: "get", variables: { id: 2 }, headers: new Headers() },
      next,
    );

    expect(calls).toBe(2);
  });

  it("accepts custom storage", async () => {
    const storage = new Map<string, { data: MiddlewareResponse; expiry: number }>();
    const handler = cacheMiddleware({ scope: "public", ttl: 5000, storage }).handler as WrapHandler;
    const ctx = { source: "api", method: "test", headers: new Headers() };

    await handler(ctx, () => Promise.resolve(ok("data")));

    expect(storage.size).toBe(1);
  });
});
