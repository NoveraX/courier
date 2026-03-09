import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineApi, defineGroup, endpoint } from "../src/define/index";
import {
	authMiddleware,
	cacheMiddleware,
	composeMiddleware,
	defineMiddleware,
	logMiddleware,
	rateLimitMiddleware,
	retryMiddleware,
} from "../src/middleware/index";
import type { MiddlewareFn, MiddlewareResponse } from "../src/middleware/types";
import { executeRequest } from "../src/utils/execute";

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

function createApi(middleware?: MiddlewareFn[]) {
	return defineApi({
		baseURL: "https://api.test.com",
		middleware,
		groups: {
			users: defineGroup({
				prefix: "users",
				endpoints: {
					getAll: endpoint<{ id: number; name: string }[]>()(({ get }) =>
						get(),
					),
					create: endpoint<{ id: number; name: string }, { name: string }>()(
						({ post }, vars) => post("", vars),
					),
				},
			}),
		},
	});
}

const ok = (data: unknown = []) => MiddlewareResponseHelper(200, data);
const serverError = (data: unknown = { error: "fail" }) =>
	MiddlewareResponseHelper(500, data);

function MiddlewareResponseHelper(
	status: number,
	data: unknown,
): MiddlewareResponse {
	return { status, data, headers: new Headers() };
}

// ---- defineMiddleware ----

describe("defineMiddleware", () => {
	it("returns the same function", () => {
		const fn: MiddlewareFn = async (_ctx, next) => next();
		expect(defineMiddleware(fn)).toBe(fn);
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

		const first = defineMiddleware(async (_ctx, next) => {
			order.push("first:before");
			const res = await next();
			order.push("first:after");
			return res;
		});

		const second = defineMiddleware(async (_ctx, next) => {
			order.push("second:before");
			const res = await next();
			order.push("second:after");
			return res;
		});

		const composed = composeMiddleware([first, second]);
		await composed(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				order.push("handler");
				return Promise.resolve(ok());
			},
		);

		expect(order).toEqual([
			"first:before",
			"second:before",
			"handler",
			"second:after",
			"first:after",
		]);
	});

	it("allows middleware to modify context", async () => {
		const addHeader = defineMiddleware(async (ctx, next) => {
			ctx.headers.set("X-Custom", "value");
			return next();
		});

		const composed = composeMiddleware([addHeader]);
		let capturedHeaders: Headers | undefined;

		await composed(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				return Promise.resolve(ok());
			},
		);

		// Verified implicitly — the middleware modified the shared ctx.headers
		const ctx = { source: "api", method: "test", headers: new Headers() };
		await composed(ctx, () => {
			capturedHeaders = ctx.headers;
			return Promise.resolve(ok());
		});

		expect(capturedHeaders?.get("X-Custom")).toBe("value");
	});

	it("allows middleware to transform response", async () => {
		const transform = defineMiddleware(async (_ctx, next) => {
			const res = await next();
			return { ...res, data: "transformed" };
		});

		const composed = composeMiddleware([transform]);
		const result = await composed(
			{ source: "api", method: "test", headers: new Headers() },
			() => Promise.resolve(ok("original")),
		);

		expect(result.data).toBe("transformed");
	});

	it("allows middleware to short-circuit without calling next", async () => {
		const cached = defineMiddleware(async () => ok("from-cache"));

		const nextCalled = vi.fn();
		const composed = composeMiddleware([cached]);
		const result = await composed(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				nextCalled();
				return Promise.resolve(ok("from-handler"));
			},
		);

		expect(result.data).toBe("from-cache");
		expect(nextCalled).not.toHaveBeenCalled();
	});

	it("allows retry by calling next() multiple times", async () => {
		let calls = 0;

		const retrier = defineMiddleware(async (_ctx, next) => {
			const res = await next();
			if (res.status === 500 && calls < 2) {
				return next();
			}
			return res;
		});

		const composed = composeMiddleware([retrier]);
		const result = await composed(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				return Promise.resolve(calls < 2 ? serverError() : ok("success"));
			},
		);

		expect(result.data).toBe("success");
		expect(calls).toBe(2);
	});
});

// ---- integration: middleware in executeRequest ----

describe("integration: middleware in executeRequest", () => {
	it("middleware can modify request headers", async () => {
		const addAuth = defineMiddleware(async (ctx, next) => {
			ctx.headers.set("Authorization", "Bearer test-token");
			return next();
		});

		const api = createApi([addAuth]);
		fetchSpy.mockResolvedValue(mockFetchResponse([{ id: 1, name: "A" }]));

		await executeRequest({ api }, { source: "api", group: "users", method: "getAll" });

		expect(fetchSpy).toHaveBeenCalled();
	});

	it("middleware can transform response data", async () => {
		const wrap = defineMiddleware(async (_ctx, next) => {
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
		const block = defineMiddleware(async () => ({
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

	it("multiple middleware compose correctly in executeRequest", async () => {
		const order: string[] = [];

		const first = defineMiddleware(async (_ctx, next) => {
			order.push("first");
			const res = await next();
			order.push("first:done");
			return res;
		});

		const second = defineMiddleware(async (_ctx, next) => {
			order.push("second");
			const res = await next();
			order.push("second:done");
			return res;
		});

		const api = createApi([first, second]);
		fetchSpy.mockResolvedValue(mockFetchResponse([]));

		await executeRequest(
			{ api },
			{ source: "api", group: "users", method: "getAll" },
		);

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
		const retry = retryMiddleware({ limit: 2, backoff: 0 });

		const result = await retry(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				return Promise.resolve(calls < 3 ? serverError() : ok("success"));
			},
		);

		expect(result.data).toBe("success");
		expect(calls).toBe(3);
	});

	it("stops after limit is reached", async () => {
		let calls = 0;
		const retry = retryMiddleware({ limit: 1, backoff: 0 });

		const result = await retry(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				return Promise.resolve(serverError());
			},
		);

		expect(result.status).toBe(500);
		expect(calls).toBe(2); // 1 initial + 1 retry
	});

	it("respects custom retryOn condition", async () => {
		let calls = 0;
		const retry = retryMiddleware({
			limit: 2,
			backoff: 0,
			retryOn: (res) => res.status === 429,
		});

		const result = await retry(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				if (calls === 1) return Promise.resolve({ status: 429, data: "rate limited", headers: new Headers() });
				return Promise.resolve(ok("ok"));
			},
		);

		expect(result.data).toBe("ok");
		expect(calls).toBe(2);
	});

	it("retries on thrown errors", async () => {
		let calls = 0;
		const retry = retryMiddleware({ limit: 1, backoff: 0 });

		const result = await retry(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				if (calls === 1) throw new Error("network error");
				return Promise.resolve(ok("recovered"));
			},
		);

		expect(result.data).toBe("recovered");
		expect(calls).toBe(2);
	});

	it("throws after exhausting retries on error", async () => {
		const retry = retryMiddleware({ limit: 1, backoff: 0 });

		await expect(
			retry(
				{ source: "api", method: "test", headers: new Headers() },
				() => { throw new Error("permanent"); },
			),
		).rejects.toThrow("permanent");
	});

	it("does not retry on success", async () => {
		let calls = 0;
		const retry = retryMiddleware({ limit: 3, backoff: 0 });

		await retry(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				return Promise.resolve(ok());
			},
		);

		expect(calls).toBe(1);
	});
});

// ---- logMiddleware ----

describe("logMiddleware", () => {
	it("logs successful requests", async () => {
		const messages: string[] = [];
		const log = logMiddleware({ logger: (msg) => messages.push(msg) });

		await log(
			{ source: "api", group: "users", method: "getAll", headers: new Headers() },
			() => Promise.resolve(ok()),
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatch(/api:users:getAll → 200 \(\d+ms\)/);
	});

	it("logs errors", async () => {
		const messages: string[] = [];
		const log = logMiddleware({ logger: (msg) => messages.push(msg) });

		await expect(
			log(
				{ source: "api", method: "ping", headers: new Headers() },
				() => { throw new Error("boom"); },
			),
		).rejects.toThrow("boom");

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatch(/api:ping → ERROR \(\d+ms\)/);
	});

	it("omits group when undefined", async () => {
		const messages: string[] = [];
		const log = logMiddleware({ logger: (msg) => messages.push(msg) });

		await log(
			{ source: "api", method: "health", headers: new Headers() },
			() => Promise.resolve(ok()),
		);

		expect(messages[0]).toMatch(/^api:health/);
	});
});

// ---- authMiddleware ----

describe("authMiddleware", () => {
	it("attaches auth header", async () => {
		const auth = authMiddleware({ getToken: () => "tok123" });
		const ctx = { source: "api", method: "test", headers: new Headers() };

		await auth(ctx, () => Promise.resolve(ok()));

		expect(ctx.headers.get("Authorization")).toBe("Bearer tok123");
	});

	it("refreshes token on 401", async () => {
		let callCount = 0;
		const auth = authMiddleware({
			getToken: () => "expired",
			refreshToken: () => "fresh",
		});

		const ctx = { source: "api", method: "test", headers: new Headers() };
		const result = await auth(ctx, () => {
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
		const auth = authMiddleware({
			getToken: () => "key",
			header: "X-API-Key",
			scheme: "",
		});

		const ctx = { source: "api", method: "test", headers: new Headers() };
		await auth(ctx, () => Promise.resolve(ok()));

		expect(ctx.headers.get("X-API-Key")).toBe("key");
	});

	it("does not refresh if no refreshToken provided", async () => {
		let calls = 0;
		const auth = authMiddleware({ getToken: () => "token" });

		const result = await auth(
			{ source: "api", method: "test", headers: new Headers() },
			() => {
				calls++;
				return Promise.resolve({ status: 401, data: "no auth", headers: new Headers() });
			},
		);

		expect(result.status).toBe(401);
		expect(calls).toBe(1);
	});
});

// ---- rateLimitMiddleware ----

describe("rateLimitMiddleware", () => {
	it("allows requests within the limit", async () => {
		const rl = rateLimitMiddleware({ maxRequests: 3, window: 1000 });
		const ctx = { source: "api", method: "test", headers: new Headers() };
		const next = () => Promise.resolve(ok());

		const r1 = await rl(ctx, next);
		const r2 = await rl(ctx, next);
		const r3 = await rl(ctx, next);

		expect(r1.status).toBe(200);
		expect(r2.status).toBe(200);
		expect(r3.status).toBe(200);
	});

	it("delays requests beyond the limit", async () => {
		const rl = rateLimitMiddleware({ maxRequests: 1, window: 50 });
		const ctx = { source: "api", method: "test", headers: new Headers() };
		const next = () => Promise.resolve(ok());

		const start = Date.now();
		await rl(ctx, next);
		await rl(ctx, next); // should be delayed
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(40);
	});
});

// ---- cacheMiddleware ----

describe("cacheMiddleware", () => {
	it("caches successful responses", async () => {
		let calls = 0;
		const cache = cacheMiddleware({ ttl: 5000 });
		const ctx = { source: "api", group: "users", method: "getAll", headers: new Headers() };

		const next = () => {
			calls++;
			return Promise.resolve(ok("data"));
		};

		await cache(ctx, next);
		const result = await cache(ctx, next);

		expect(result.data).toBe("data");
		expect(calls).toBe(1); // second call served from cache
	});

	it("does not cache error responses", async () => {
		let calls = 0;
		const cache = cacheMiddleware({ ttl: 5000 });
		const ctx = { source: "api", method: "test", headers: new Headers() };

		const next = () => {
			calls++;
			return Promise.resolve(calls === 1 ? serverError() : ok("ok"));
		};

		await cache(ctx, next);
		const result = await cache(ctx, next);

		expect(result.data).toBe("ok");
		expect(calls).toBe(2);
	});

	it("respects TTL expiry", async () => {
		vi.useFakeTimers();

		let calls = 0;
		const cache = cacheMiddleware({ ttl: 100 });
		const ctx = { source: "api", method: "test", headers: new Headers() };

		const next = () => {
			calls++;
			return Promise.resolve(ok(`v${calls}`));
		};

		await cache(ctx, next);
		expect(calls).toBe(1);

		vi.advanceTimersByTime(150);

		const result = await cache(ctx, next);
		expect(result.data).toBe("v2");
		expect(calls).toBe(2);

		vi.useRealTimers();
	});

	it("caches separately per variables", async () => {
		let calls = 0;
		const cache = cacheMiddleware({ ttl: 5000 });

		const next = () => {
			calls++;
			return Promise.resolve(ok(`r${calls}`));
		};

		await cache(
			{ source: "api", method: "get", variables: { id: 1 }, headers: new Headers() },
			next,
		);
		await cache(
			{ source: "api", method: "get", variables: { id: 2 }, headers: new Headers() },
			next,
		);

		expect(calls).toBe(2);
	});

	it("accepts custom storage", async () => {
		const storage = new Map<string, { data: MiddlewareResponse; expiry: number }>();
		const cache = cacheMiddleware({ ttl: 5000, storage });
		const ctx = { source: "api", method: "test", headers: new Headers() };

		await cache(ctx, () => Promise.resolve(ok("data")));

		expect(storage.size).toBe(1);
	});
});
