import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createCaller } from "../../src/caller";
import { courier } from "../../src/define/courier";
import { defineApi } from "../../src/define/api";
import { HTTPError } from "../../src/errors";
import { retryMiddleware } from "../../src/middleware/index";
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
    const client = clientFor(url, retryMiddleware({ limit: 3, backoff: 1 }));

    await expect(client.read({ code: status })).rejects.toMatchObject({ status });

    expect(seen).toHaveLength(1);
  });

  it("retries a 5xx answer until the upstream succeeds", async () => {
    const { url, seen } = await answering(503, 500);
    const client = clientFor(url, retryMiddleware({ limit: 3, backoff: 1 }));

    await expect(client.read({ code: 503 })).resolves.toEqual({ ok: true });

    expect(seen).toHaveLength(3);
  });

  it("rejects with the last 5xx once the limit is spent", async () => {
    const { url, seen } = await answering(503, 503, 503);
    const client = clientFor(url, retryMiddleware({ limit: 2, backoff: 1 }));

    await expect(client.read({ code: 503 })).rejects.toMatchObject({ status: 503 });

    expect(seen).toHaveLength(3);
  });

  it("retries a request that got no answer", async () => {
    upstream = await startUpstream((req, res, index) => {
      if (index === 0) req.socket.destroy();
      else sendJson(res, 200, { ok: true });
    });
    const client = clientFor(upstream.url, retryMiddleware({ limit: 2, backoff: 1 }));

    await expect(client.read({ code: 0 })).resolves.toEqual({ ok: true });

    expect(upstream.seen).toHaveLength(2);
  });

  it("does not retry an answer that fails its response schema", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { id: 1 }));
    const client = clientFor(upstream.url, retryMiddleware({ limit: 3, backoff: 1 }));

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
        backoff: 1,
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
        backoff: 1,
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
      retryMiddleware({ limit: 3, backoff: 1, retryOn: anyFailure }),
    );

    await expect(client.typed()).rejects.toThrow();

    expect(upstream.seen).toHaveLength(1);
  });
});

describe("retryMiddleware and cancellation", () => {
  it("surfaces a caller's cancellation at once", async () => {
    upstream = await startUpstream(() => {});
    const client = clientFor(upstream.url, retryMiddleware({ retryOn: anyFailure }));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const started = Date.now();

    await expect(
      client.with({ signal: controller.signal }).read({ code: 200 }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(Date.now() - started).toBeLessThan(250);
    expect(upstream.seen).toHaveLength(1);
  });

  it("does not retry a cancellation that carries its own reason", async () => {
    upstream = await startUpstream(() => {});
    const client = clientFor(upstream.url, retryMiddleware({ backoff: 200 }));
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("navigated away")), 30);
    const started = Date.now();

    await expect(client.with({ signal: controller.signal }).read({ code: 200 })).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(200);
    expect(upstream.seen).toHaveLength(1);
  });

  it("stops waiting between attempts when the caller cancels", async () => {
    upstream = await startUpstream((_req, res, index) => {
      if (index === 0) sendJson(res, 503, { message: "unavailable" });
    });
    const client = clientFor(upstream.url, retryMiddleware({ backoff: 2000 }));
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 100);

    await expect(
      client.with({ signal: controller.signal }).read({ code: 503 }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(upstream.seen).toHaveLength(1);
  });

  it("does not re-issue a request that a newer identical one superseded", async () => {
    /* Identical requests supersede each other only in a browser. */
    vi.stubGlobal("document", {});
    upstream = await startUpstream((_req, res) => {
      setTimeout(() => sendJson(res, 200, { ok: true }), 100);
    });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        deduplicate: true,
        middleware: [retryMiddleware({ limit: 3, backoff: 1, retryOn: anyFailure })],
        endpoints: { read: endpoint.get("slow") },
      }),
    );

    const first = client.read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = client.read();

    await expect(first).rejects.toMatchObject({ status: 499 });
    await expect(second).resolves.toEqual({ ok: true });
    expect(upstream.seen).toHaveLength(2);
  });
});
