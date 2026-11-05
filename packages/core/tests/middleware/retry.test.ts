import type { ServerResponse } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { HTTPError, NetworkError } from "../../src/errors";
import { defineMiddleware, retryMiddleware } from "../../src/middleware/index";
import type { Middleware, RetryFailure } from "../../src/middleware/types";
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

/** A condition accepting every failure: whatever failed is worth another attempt. */
function anyFailure(_failure: RetryFailure): boolean {
  return true;
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
  it.each([400, 401, 404, 409, 422, 501])("does not retry a %i answer", async (status) => {
    const { url, seen } = await answering(status);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.read({ code: status })).rejects.toMatchObject({ status });

    expect(seen).toHaveLength(1);
  });

  it.each([408, 425, 429, 500, 502, 503, 504])("retries a %i answer", async (status) => {
    const { url, seen } = await answering(status);
    const client = clientFor(url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.read({ code: status })).resolves.toEqual({ ok: true });

    expect(seen).toHaveLength(2);
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

  it("does not send a read again once its own timeout ran out", async () => {
    /* A hung upstream: with three retries it once held the call for four timeouts. */
    upstream = await startUpstream(() => {});
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 3, delay: 1 })],
        endpoints: { slow: endpoint.get("slow").timeout(100) },
      }),
    );

    await expect(client.slow()).rejects.toMatchObject({ name: "TimeoutError", scope: "attempt" });

    expect(upstream.seen).toHaveLength(1);
  });

  it("sends a read whose timeout ran out again when retryOn names timeouts", async () => {
    upstream = await startUpstream((_req, res, index) => {
      if (index > 0) sendJson(res, 200, { ok: true });
    });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 1, delay: 1, retryOn: ["timeout"] })],
        endpoints: { slow: endpoint.get("slow").timeout(100) },
      }),
    );

    await expect(client.slow()).resolves.toEqual({ ok: true });

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
    const judged: RetryFailure[] = [];
    const client = clientFor(
      upstream.url,
      retryMiddleware({
        limit: 3,
        delay: 1,
        retryOn: (failure) => {
          judged.push(failure);
          if (failure.kind !== "status") return false;
          const { data } = failure;
          return (
            failure.status === 429 &&
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
    expect(
      judged.map((failure) => failure.kind === "status" && failure.headers.get("content-type")),
    ).toEqual(["application/json", "application/json"]);
  });

  it("presents a request that got no answer as a network failure", async () => {
    upstream = await startUpstream((req) => req.socket.destroy());
    const judged: RetryFailure[] = [];
    const client = clientFor(
      upstream.url,
      retryMiddleware({
        limit: 3,
        delay: 1,
        retryOn: (failure) => {
          judged.push(failure);
          return false;
        },
      }),
    );

    await expect(client.read({ code: 0 })).rejects.toBeInstanceOf(NetworkError);

    expect(judged).toEqual([{ kind: "network", error: expect.any(NetworkError) }]);
    expect(upstream.seen).toHaveLength(1);
  });

  it("refuses the 0 that once stood for a request that got no answer, naming what replaces it", () => {
    expect(() => retryMiddleware({ retryOn: [0, 503] })).toThrow(
      expect.objectContaining({
        code: "RETRY_OPTIONS_INVALID",
        message: expect.stringContaining('"network"'),
      }),
    );
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
      retryMiddleware({ delay: LONG_DELAY, jitter: "none", retryOn: anyFailure }),
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
    const client = clientFor(upstream.url, retryMiddleware({ delay: LONG_DELAY, jitter: "none" }));

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
    const client = clientFor(upstream.url, retryMiddleware({ delay: LONG_DELAY, jitter: "none" }));

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

    await expect(first).rejects.toMatchObject({ name: "AbortError", code: "SUPERSEDED" });
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
        middleware: [retryMiddleware({ limit: 2, delay: 200, backoff: "fixed", jitter: "none" })],
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
    expect(await first).toMatchObject({ name: "AbortError", code: "SUPERSEDED" });
    expect(upstream.seen.map((request) => request.url)).toEqual(["/slow?q=a", "/slow?q=ab"]);
  });
});

/** Answer 503, asking to be asked again after `retryAfter`. */
function unavailable(res: ServerResponse, retryAfter: string): void {
  res.writeHead(503, { "content-type": "application/json", "retry-after": retryAfter });
  res.end(JSON.stringify({ message: "unavailable" }));
}

describe("retryMiddleware and an answer's Retry-After", () => {
  it("waits what the answer asks rather than its own delay", async () => {
    upstream = await startUpstream((_req, res, index) =>
      index === 0 ? unavailable(res, "0") : sendJson(res, 200, { ok: true }),
    );
    const waits: number[] = [];
    const client = clientFor(
      upstream.url,
      retryMiddleware({
        delay: 60_000,
        jitter: "none",
        onRetry: (retry) => waits.push(retry.delay),
      }),
    );

    await expect(client.read({ code: 503 })).resolves.toEqual({ ok: true });

    expect(waits).toEqual([0]);
  });

  it("fails at once when the answer asks for longer than maxDelay", async () => {
    upstream = await startUpstream((_req, res) => unavailable(res, "120"));
    const client = clientFor(upstream.url, retryMiddleware({ delay: 1 }));

    await expect(client.read({ code: 503 })).rejects.toMatchObject({ status: 503 });

    expect(upstream.seen).toHaveLength(1);
  });
});

describe("retryMiddleware and a deadline", () => {
  it("stops an attempt it overtakes with a TimeoutError of scope deadline", async () => {
    upstream = await startUpstream(() => {});
    const client = clientFor(upstream.url, retryMiddleware({ deadline: 200 }));
    const started = performance.now();

    await expect(client.read({ code: 200 })).rejects.toMatchObject({
      name: "TimeoutError",
      scope: "deadline",
      timeout: 200,
    });

    expect(performance.now() - started).toBeLessThan(2_000);
    expect(upstream.seen).toHaveLength(1);
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

  it("sends a write again whose connection was refused: it never left", async () => {
    const closed = await startUpstream(() => {});
    await closed.close();
    const retries: RetryFailure[] = [];
    const client = clientFor(
      closed.url,
      retryMiddleware({ limit: 2, delay: 1, onRetry: (retry) => retries.push(retry.failure) }),
    );

    await expect(client.write({ item: "book" })).rejects.toMatchObject({
      name: "NetworkError",
      systemCode: "ECONNREFUSED",
    });

    expect(retries).toHaveLength(2);
  });

  it("does not send a write again that may have reached the upstream", async () => {
    upstream = await startUpstream((req) => req.socket.destroy());
    const client = clientFor(upstream.url, retryMiddleware({ limit: 3, delay: 1 }));

    await expect(client.write({ item: "book" })).rejects.toBeInstanceOf(NetworkError);

    expect(upstream.seen).toHaveLength(1);
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
          read: endpoint
            .get("items")
            .retry({ limit: 1, delay: 600, backoff: "fixed", jitter: "none" }),
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

  it("does not take the old names, in its types or when the policy is made", async () => {
    // @ts-expect-error — `delay` is the wait in ms; `backoff` is how it grows
    expect(() => retryMiddleware({ backoff: 300 })).toThrow(
      "A retry policy's backoff cannot be 300",
    );
    const { url, seen } = await answering();
    const base = courier({ retry: { limit: 50 } });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: url,
        endpoints: {
          // @ts-expect-error — `limit` is the number of retries
          renamed: endpoint.get("items").retry({ attempts: 3 }),
          tooMany: base.endpoint.get("items"),
        },
      }),
    );

    /* An endpoint's policy is made on its first call, which it refuses before sending. */
    await expect(client.renamed()).rejects.toMatchObject({
      code: "RETRY_OPTIONS_INVALID",
      message: 'A retry policy has no option "attempts"',
    });
    await expect(client.tooMany()).rejects.toThrow("A retry policy's limit cannot be 50");
    expect(seen).toHaveLength(0);
  });
});
