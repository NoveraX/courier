/**
 * What the cache may and may not hand to the next caller.
 *
 * The store is shared by the whole process, so its key tells callers apart:
 * keyed by `source:group:method:variables` alone, an authenticated response
 * would be served to whoever asked next — with the `Set-Cookie` that came
 * with it. The tests vary the caller for that reason: a context built with
 * an empty `new Headers()` for every call never shows the difference.
 */
import { describe, expect, it } from "vitest";

import { cacheMiddleware } from "../src/middleware/cache";
import type { MiddlewareContext, MiddlewareResponse, WrapHandler } from "../src/middleware/types";

/** The partition every realistic deployment wants: one per credential. */
const byCaller = (ctx: MiddlewareContext): string =>
  ctx.request?.headers.get("authorization") ?? "anonymous";

function contextFor(
  token: string | undefined,
  overrides: Partial<MiddlewareContext> = {},
): MiddlewareContext {
  return {
    source: "api",
    group: "users",
    method: "me",
    headers: new Headers(),
    request: new Request("https://app.example.com/api", {
      headers: token ? { authorization: token } : {},
    }),
    kind: "query",
    ...overrides,
  };
}

function respond(data: unknown, init: Partial<MiddlewareResponse> = {}): MiddlewareResponse {
  return { status: 200, data, headers: new Headers(), ...init };
}

/** A `next` that answers with whatever it is told, counting its calls. */
function answering(values: unknown[]) {
  let calls = 0;
  return {
    next: () => Promise.resolve(respond(values[Math.min(calls++, values.length - 1)])),
    get calls() {
      return calls;
    },
  };
}

describe("cacheMiddleware — partitioning", () => {
  it("does not serve one caller's response to another", async () => {
    const handler = cacheMiddleware({ scope: byCaller, ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["alice's profile", "bob's profile"]);

    const first = await handler(contextFor("Bearer alice"), upstream.next);
    const second = await handler(contextFor("Bearer bob"), upstream.next);

    expect(first.data).toBe("alice's profile");
    expect(second.data).toBe("bob's profile");
    expect(upstream.calls).toBe(2);
  });

  it("serves the same caller from cache", async () => {
    const handler = cacheMiddleware({ scope: byCaller, ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["alice's profile", "should not be reached"]);

    await handler(contextFor("Bearer alice"), upstream.next);
    const again = await handler(contextFor("Bearer alice"), upstream.next);

    expect(again.data).toBe("alice's profile");
    expect(upstream.calls).toBe(1);
  });

  it("keeps an anonymous caller apart from an authenticated one", async () => {
    const handler = cacheMiddleware({ scope: byCaller, ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["public copy", "alice's copy"]);

    const anonymous = await handler(contextFor(undefined), upstream.next);
    const alice = await handler(contextFor("Bearer alice"), upstream.next);

    expect(anonymous.data).toBe("public copy");
    expect(alice.data).toBe("alice's copy");
  });

  it("reads the incoming request rather than the narrowed outbound headers", async () => {
    const handler = cacheMiddleware({ scope: byCaller, ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["alice", "bob"]);

    /* `headers` is what survives allowedHeaders, and it is empty here for both
       callers — the partition must still tell them apart. */
    await handler(contextFor("Bearer alice", { headers: new Headers() }), upstream.next);
    const bob = await handler(contextFor("Bearer bob", { headers: new Headers() }), upstream.next);

    expect(bob.data).toBe("bob");
    expect(upstream.calls).toBe(2);
  });

  it("shares one copy when the response is declared public", async () => {
    const handler = cacheMiddleware({ scope: "public", ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["the same for everyone", "unreachable"]);

    await handler(contextFor("Bearer alice"), upstream.next);
    const bob = await handler(contextFor("Bearer bob"), upstream.next);

    expect(bob.data).toBe("the same for everyone");
    expect(upstream.calls).toBe(1);
  });
});

describe("cacheMiddleware — what it refuses to store", () => {
  it("does not store a response that sets a cookie", async () => {
    const handler = cacheMiddleware({ scope: "public", ttl: 5_000 }).handler as WrapHandler;
    let calls = 0;
    const next = () => {
      calls += 1;
      return Promise.resolve(
        respond("session established", { headers: new Headers({ "set-cookie": "sid=abc" }) }),
      );
    };

    await handler(contextFor("Bearer alice"), next);
    await handler(contextFor("Bearer bob"), next);

    expect(calls).toBe(2);
  });

  it("does not cache a write", async () => {
    const handler = cacheMiddleware({ scope: "public", ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["created", "created again"]);

    await handler(contextFor("Bearer alice", { kind: "mutation" }), upstream.next);
    const second = await handler(contextFor("Bearer alice", { kind: "mutation" }), upstream.next);

    expect(second.data).toBe("created again");
    expect(upstream.calls).toBe(2);
  });

  it("does not collide every upload on one entry", async () => {
    const handler = cacheMiddleware({ scope: "public", ttl: 5_000 }).handler as WrapHandler;
    const upstream = answering(["first file", "second file"]);

    const one = new FormData();
    one.append("file", "a");
    const two = new FormData();
    two.append("file", "b");

    await handler(contextFor("Bearer alice", { variables: one }), upstream.next);
    const second = await handler(contextFor("Bearer alice", { variables: two }), upstream.next);

    expect(second.data).toBe("second file");
    expect(upstream.calls).toBe(2);
  });

  it("does not hand a second caller an already-consumed stream", async () => {
    const handler = cacheMiddleware({ scope: "public", ttl: 5_000 }).handler as WrapHandler;
    let calls = 0;
    const next = () => {
      calls += 1;
      return Promise.resolve(respond(new ReadableStream()));
    };

    await handler(contextFor(undefined), next);
    await handler(contextFor(undefined), next);

    expect(calls).toBe(2);
  });

  it("keeps the store bounded rather than growing on a client-shaped key", async () => {
    const storage = new Map();
    const handler = cacheMiddleware({
      scope: byCaller,
      ttl: 5_000,
      maxEntries: 3,
      storage,
    }).handler as WrapHandler;

    for (let i = 0; i < 20; i += 1) {
      await handler(contextFor(`Bearer caller-${i}`), () => Promise.resolve(respond(i)));
    }

    expect(storage.size).toBeLessThanOrEqual(3);
  });
});
