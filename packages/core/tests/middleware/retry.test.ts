import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { HTTPError } from "../../src/errors";
import { defineMiddleware, retryMiddleware } from "../../src/middleware/index";
import type { Middleware, MiddlewareResponse } from "../../src/middleware/types";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  await upstream?.close();
  upstream = undefined;
});

function clientFor(url: string, retry: Middleware) {
  return createCaller(
    defineApi({
      name: "api",
      baseURL: url,
      middleware: [retry],
      endpoints: {
        read: endpoint.get("status/:code").variables<{ code: number }>(),
        typed: endpoint.get("typed").response(z.object({ id: z.string() })),
        write: endpoint.post("orders").variables<{ item: string }>(),
        search: endpoint.post("search").variables<{ q: string }>().reads(),
      },
    }),
  );
}

/** A condition accepting every answer that is not a success. */
function anyFailure(response: MiddlewareResponse): boolean {
  return response.status < 200 || response.status >= 300;
}

/** An upstream answering the scripted statuses in turn, then 200. */
async function answering(...statuses: number[]): Promise<Upstream> {
  upstream = await startUpstream((_req, res, index) => {
    const status = statuses[index] ?? 200;
    sendJson(res, status, status === 200 ? { ok: true } : { message: `failed with ${status}` });
  });
  return upstream;
}

describe("retryMiddleware by default", () => {
  it.each([400, 401, 404, 409, 422, 429])("does not retry a %i answer", async (status) => {
    const { url, seen } = await answering(status);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.read({ code: status })).rejects.toMatchObject({ status });

    expect(seen).toHaveLength(1);
  });

  it("retries a 5xx answer until the upstream succeeds", async () => {
    const { url, seen } = await answering(503, 500);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.read({ code: 503 })).resolves.toEqual({ ok: true });

    expect(seen).toHaveLength(3);
  });

  it("rejects with the last 5xx once the limit is spent", async () => {
    const { url, seen } = await answering(503, 503, 503);
    const client = clientFor(url, retryMiddleware({ limit: 2, delay: 1 }));

    await expect(client.read({ code: 503 })).rejects.toMatchObject({ status: 503 });

    expect(seen).toHaveLength(3);
  });

  it("retries a request that got no answer", async () => {
    upstream = await startUpstream((req, res, index) => {
      if (index === 0) req.socket.destroy();
      else sendJson(res, 200, { ok: true });
    });
    const client = clientFor(upstream.url, retryMiddleware({ limit: 2, delay: 1 }));

    await expect(client.read({ code: 0 })).resolves.toEqual({ ok: true });

    expect(upstream.seen).toHaveLength(2);
  });

  it("does not retry an answer that fails its response schema", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { id: 1 }));
    const client = clientFor(upstream.url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.typed()).rejects.toThrow();

    expect(upstream.seen).toHaveLength(1);
  });
});

describe("retryMiddleware with retryOn", () => {
  it("judges a refused request by its status and body", async () => {
    upstream = await startUpstream((_req, res, index) => {
      if (index === 0) sendJson(res, 429, { retryable: true });
      else if (index === 1) sendJson(res, 429, { retryable: false });
      else sendJson(res, 200, { ok: true });
    });
    const judged: MiddlewareResponse[] = [];
    const client = clientFor(
      upstream.url,
      retryMiddleware({
        limit: 3,
        delay: 1,
        retryOn: (response) => {
          judged.push(response);
          const { data } = response;
          return (
            response.status === 429 &&
            typeof data === "object" &&
            data !== null &&
            "retryable" in data &&
            data.retryable === true
          );
        },
      }),
    );

    const call = client.read({ code: 429 });

    await expect(call).rejects.toBeInstanceOf(HTTPError);
    await expect(call).rejects.toMatchObject({ status: 429, data: { retryable: false } });
    expect(upstream.seen).toHaveLength(2);
    expect(judged.map((r) => r.headers.get("content-type"))).toEqual([
      "application/json",
      "application/json",
    ]);
  });

  it("presents a request that got no answer as status 0", async () => {
    upstream = await startUpstream((req) => req.socket.destroy());
    const judged: number[] = [];
    const client = clientFor(
      upstream.url,
      retryMiddleware({
        limit: 3,
        delay: 1,
        retryOn: (response) => {
          judged.push(response.status);
          return false;
        },
      }),
    );

    await expect(client.read({ code: 0 })).rejects.toMatchObject({ status: 0 });

    expect(judged).toEqual([0]);
    expect(upstream.seen).toHaveLength(1);
  });

  it("does not retry an answer that fails its response schema, whatever the condition", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { id: 1 }));
    const client = clientFor(
      upstream.url,
      retryMiddleware({ limit: 3, delay: 1, retryOn: anyFailure }),
    );

    await expect(client.typed()).rejects.toThrow();

    expect(upstream.seen).toHaveLength(1);
  });
});

/* Each wait between attempts below is seconds long, and a cancellation is
   held to half of it: one the middleware waited out could not be mistaken
   for a slow moment of the machine. */
const LONG_DELAY = 4_000;

describe("retryMiddleware and cancellation", () => {
  it("surfaces a caller's cancellation at once", async () => {
    const controller = new AbortController();
    let abortedAt = 0;
    upstream = await startUpstream(() => {
      abortedAt = Date.now();
      controller.abort();
    });
    const client = clientFor(
      upstream.url,
      retryMiddleware({ delay: LONG_DELAY, retryOn: anyFailure }),
    );

    await expect(
      client.with({ signal: controller.signal }).read({ code: 200 }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(Date.now() - abortedAt).toBeLessThan(LONG_DELAY / 2);
    expect(upstream.seen).toHaveLength(1);
  });

  it("does not retry a cancellation that carries its own reason", async () => {
    const controller = new AbortController();
    let abortedAt = 0;
    upstream = await startUpstream(() => {
      abortedAt = Date.now();
      controller.abort(new Error("navigated away"));
    });
    const client = clientFor(upstream.url, retryMiddleware({ delay: LONG_DELAY }));

    await expect(client.with({ signal: controller.signal }).read({ code: 200 })).rejects.toThrow();

    expect(Date.now() - abortedAt).toBeLessThan(LONG_DELAY / 2);
    expect(upstream.seen).toHaveLength(1);
  });

  it("stops waiting between attempts when the caller cancels", async () => {
    const controller = new AbortController();
    let abortedAt = 0;
    upstream = await startUpstream((_req, res) => {
      sendJson(res, 503, { message: "unavailable" });
      setTimeout(() => {
        abortedAt = Date.now();
        controller.abort();
      }, 50);
    });
    const client = clientFor(upstream.url, retryMiddleware({ delay: LONG_DELAY }));

    await expect(
      client.with({ signal: controller.signal }).read({ code: 503 }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(Date.now() - abortedAt).toBeLessThan(LONG_DELAY / 2);
    expect(upstream.seen).toHaveLength(1);
  });

  it("does not re-issue a read that a newer call to its endpoint superseded", async () => {
    /* A newer call supersedes an older one only in a browser. */
    vi.stubGlobal("document", {});
    let firstArrived: () => void = () => {};
    const arrived = new Promise<void>((resolve) => {
      firstArrived = resolve;
    });
    upstream = await startUpstream((_req, res) => {
      firstArrived();
      setTimeout(() => sendJson(res, 200, { ok: true }), 100);
    });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 3, delay: 1, retryOn: anyFailure })],
        endpoints: { read: endpoint.get("slow").variables<{ q: string }>().cancelPrevious() },
      }),
    );

    /* Two searches, so the newer one cannot be answered from the older one's request. */
    const first = client.read({ q: "a" });
    await arrived;
    const second = client.read({ q: "ab" });

    await expect(first).rejects.toMatchObject({ status: 499 });
    await expect(second).resolves.toEqual({ ok: true });
    expect(upstream.seen).toHaveLength(2);
  });

  it("lets a newer call cancel a read that waits between attempts", async () => {
    /* A newer call supersedes an older one only in a browser. */
    vi.stubGlobal("document", {});
    upstream = await startUpstream((req, res, index) => {
      const q = new URL(req.url ?? "", "http://upstream").searchParams.get("q");
      if (index === 0) return sendJson(res, 503, { message: "failed" });
      setTimeout(() => sendJson(res, 200, { q }), q === "ab" ? 300 : 0);
    });
    let attemptEnded: () => void = () => {};
    const firstAttemptEnded = new Promise<void>((resolve) => {
      attemptEnded = resolve;
    });
    /* Inside the retry policy, so it sees each attempt end. */
    const attempts = defineMiddleware("attempts", "wrap", async (_ctx, next) => {
      try {
        return await next();
      } finally {
        attemptEnded();
      }
    });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 2, delay: 200, backoff: "fixed" })],
        endpoints: {
          read: endpoint.get("slow").variables<{ q: string }>().use(attempts).cancelPrevious(),
        },
      }),
    );

    /* The older search fails once and waits to be sent again when the newer one starts. */
    const first = client.read({ q: "a" }).catch((error: unknown) => error);
    await firstAttemptEnded;
    const second = client.read({ q: "ab" });

    await expect(second).resolves.toEqual({ q: "ab" });
    expect(await first).toMatchObject({ status: 499 });
    expect(upstream.seen.map((request) => request.url)).toEqual(["/slow?q=a", "/slow?q=ab"]);
  });
});

describe("retryMiddleware and writes", () => {
  it("does not send a write again by default", async () => {
    const { url, seen } = await answering(503);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.write({ item: "book" })).rejects.toMatchObject({ status: 503 });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("POST");
  });

  it("sends a write again when told writes may be repeated", async () => {
    const { url, seen } = await answering(503);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1, mutations: true }));

    await expect(client.write({ item: "book" })).resolves.toEqual({ ok: true });

    expect(seen).toHaveLength(2);
  });

  it("retries an endpoint declared a read whatever verb carries it", async () => {
    const { url, seen } = await answering(503);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.search({ q: "ada" })).resolves.toEqual({ ok: true });

    expect(seen.map((r) => r.method)).toEqual(["POST", "POST"]);
  });
});

describe("a retry policy declared on the builder", () => {
  function baseClient(url: string, retry: Parameters<typeof courier>[0]) {
    const base = courier(retry);
    return createCaller(
      defineApi({
        name: "api",
        baseURL: url,
        endpoints: {
          read: base.endpoint.get("items"),
          write: base.endpoint.post("items").variables<{ item: string }>(),
          repeatable: base.endpoint
            .post("items")
            .variables<{ item: string }>()
            .retry({ limit: 2, mutations: true }),
        },
      }),
    );
  }

  it("repeats a read the base retries", async () => {
    const { url, seen } = await answering(503);

    await expect(baseClient(url, { retry: { limit: 2 } }).read()).resolves.toEqual({ ok: true });

    expect(seen).toHaveLength(2);
  });

  it("does not repeat a write the base retries", async () => {
    const { url, seen } = await answering(503);

    await expect(
      baseClient(url, { retry: { limit: 2, retryOn: [503] } }).write({ item: "book" }),
    ).rejects.toMatchObject({ status: 503 });

    expect(seen).toHaveLength(1);
  });

  it("repeats a write whose policy allows it", async () => {
    const { url, seen } = await answering(503);

    await expect(baseClient(url, {}).repeatable({ item: "book" })).resolves.toEqual({ ok: true });

    expect(seen).toHaveLength(2);
  });
});

/**
 * The endpoint's policy and the middleware take the same options, each with
 * one meaning: `backoff` is the strategy and `delay` the wait in ms on both,
 * so an endpoint's policy sets its delay as the middleware does.
 */
describe("one vocabulary for a policy and the middleware", () => {
  it("retries the statuses a middleware lists, and no others", async () => {
    const { url, seen } = await answering(429, 500);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1, retryOn: [429] }));

    await expect(client.read({ code: 0 })).rejects.toMatchObject({ status: 500 });

    expect(seen).toHaveLength(2);
  });

  it("waits the delay an endpoint's policy names", async () => {
    const { url, seen } = await answering(503);
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: url,
        endpoints: {
          read: endpoint.get("items").retry({ limit: 1, delay: 600, backoff: "fixed" }),
        },
      }),
    );
    const started = performance.now();

    await expect(client.read()).resolves.toEqual({ ok: true });

    /* Twice the default 300 ms, which the policy could not change before: a
       call that waited the default is answered well before this. */
    expect(seen).toHaveLength(2);
    expect(performance.now() - started).toBeGreaterThanOrEqual(595);
  });

  it("does not take the old names", () => {
    // @ts-expect-error — `limit` is the number of retries
    endpoint.get("items").retry({ attempts: 3 });
    // @ts-expect-error — `delay` is the wait in ms; `backoff` is how it grows
    retryMiddleware({ backoff: 300 });
  });
});
