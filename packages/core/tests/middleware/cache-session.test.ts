/**
 * What a cache may share once calls carry the user's session.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { cacheMiddleware } from "../../src/middleware/cache";
import type {
  MiddlewareContext,
  MiddlewareResponse,
  WrapHandler,
} from "../../src/middleware/types";

function contextFor(headers: Record<string, string>, carriesSession = false): MiddlewareContext {
  return {
    source: "accounts",
    method: "me",
    headers: new Headers(headers),
    kind: "query",
    carriesSession,
  };
}

function answering(values: string[]) {
  let calls = 0;
  return {
    next: (): Promise<MiddlewareResponse> =>
      Promise.resolve({
        status: 200,
        data: values[Math.min(calls++, values.length - 1)],
        headers: new Headers(),
      }),
    get calls() {
      return calls;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a public cache", () => {
  it("never answers a call that carries the user's session from it", async () => {
    const handler = cacheMiddleware({ scope: "public" }).handler as WrapHandler;
    const upstream = answering(["alice's inbox", "bob's inbox"]);

    const first = await handler(contextFor({ cookie: "sid=alice" }, true), upstream.next);
    const second = await handler(contextFor({ cookie: "sid=bob" }, true), upstream.next);

    expect(first.data).toBe("alice's inbox");
    expect(second.data).toBe("bob's inbox");
    expect(upstream.calls).toBe(2);
  });

  it("still shares an answer among calls that carry none", async () => {
    const handler = cacheMiddleware({ scope: "public" }).handler as WrapHandler;
    const upstream = answering(["catalog", "catalog again"]);

    await handler(contextFor({}), upstream.next);
    const second = await handler(contextFor({}), upstream.next);

    expect(second.data).toBe("catalog");
    expect(upstream.calls).toBe(1);
  });
});

describe("a cache partitioned by session", () => {
  it("answers each set of credentials from its own partition", async () => {
    const handler = cacheMiddleware({ scope: "session" }).handler as WrapHandler;
    const upstream = answering(["alice's inbox", "bob's inbox", "never"]);

    await handler(contextFor({ cookie: "sid=alice" }, true), upstream.next);
    await handler(contextFor({ cookie: "sid=bob" }, true), upstream.next);
    const alice = await handler(contextFor({ cookie: "sid=alice" }, true), upstream.next);
    const bob = await handler(contextFor({ cookie: "sid=bob" }, true), upstream.next);

    expect(alice.data).toBe("alice's inbox");
    expect(bob.data).toBe("bob's inbox");
    expect(upstream.calls).toBe(2);
  });

  it("tells a bearer token apart from another", async () => {
    const handler = cacheMiddleware({ scope: "session" }).handler as WrapHandler;
    const upstream = answering(["first", "second"]);

    await handler(contextFor({ authorization: "Bearer a" }, true), upstream.next);
    const other = await handler(contextFor({ authorization: "Bearer b" }, true), upstream.next);

    expect(other.data).toBe("second");
  });

  it("keeps the credentials themselves out of the store's keys", async () => {
    const storage = new Map();
    const handler = cacheMiddleware({ scope: "session", storage }).handler as WrapHandler;

    await handler(contextFor({ cookie: "sid=s3cr3t" }, true), answering(["x"]).next);

    const [key] = [...storage.keys()] as string[];
    expect(key?.split("\u0000").slice(0, 2)).toEqual([
      expect.stringMatching(/^session:[\da-f]{64}$/),
      "accounts",
    ]);
    expect(key).not.toContain("s3cr3t");
  });

  it("puts calls without credentials in one partition", async () => {
    const handler = cacheMiddleware({ scope: "session" }).handler as WrapHandler;
    const upstream = answering(["public", "never"]);

    await handler(contextFor({}), upstream.next);
    const second = await handler(contextFor({}), upstream.next);

    expect(second.data).toBe("public");
  });
});
