/**
 * Failures read where an error Node makes is of another realm than the code
 * reading it, as in every test file Jest runs: each runs in a context of its
 * own, whose `Error` is not the one Node's fetch and `structuredClone` make
 * theirs of. Told by `instanceof Error`, a request no server answered failed
 * as a bare `TypeError` rather than a `NetworkError`, an answer the cache
 * could not copy failed its call, and the logger wrote an error as a string.
 * An error is told by what it is. A timeout was a `TimeoutError` already,
 * and is kept so.
 */
import type { ServerResponse } from "node:http";
import { type AddressInfo, createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import { isNetworkError, isTimeoutError } from "../../src/errors";
import { serializeError } from "../../src/logger/serialize-error";
import { cacheMiddleware, defineMiddleware } from "../../src/middleware/index";
import { type ReceivedRequest, startUpstream, type Upstream } from "../helpers/upstream";

const { endpoint } = courier();

let upstream: Upstream;
let asked = 0;
/* Where nothing listens, and fetch goes: port 1 is one of the ports it refuses to try. */
let nowhere: string;

beforeEach(async () => {
  asked = 0;
  upstream = await startUpstream(answer);
  nowhere = `http://127.0.0.1:${await freedPort()}`;
});

afterEach(async () => {
  await upstream.close();
});

function answer(request: ReceivedRequest, res: ServerResponse): void {
  if (request.url === "/silent") return;
  asked += 1;
  const body = JSON.stringify({ count: asked });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
}

function api(baseURL: string, options: { timeout?: number } = {}) {
  return createCaller(
    defineApi({
      baseURL,
      ...options,
      endpoints: {
        count: endpoint.get("count").response<{ count: number }>(),
        silent: endpoint.get("silent"),
      },
    }),
  );
}

/* A port a server has just let go of: a connection there is refused. */
async function freedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("it did not fail");
    },
    (error: unknown) => error,
  );
}

it("runs where Node's errors are of another realm", async () => {
  const error = await failureOf(fetch(nowhere));

  expect(error instanceof Error).toBe(false);
  expect(Object.prototype.toString.call(error)).toBe("[object Error]");
});

describe("a call", () => {
  it("fails as a NetworkError, the system's code named, when no server answers", async () => {
    const error = await failureOf(api(nowhere).count());

    expect(isNetworkError(error)).toBe(true);
    expect(error).toMatchObject({ systemCode: "ECONNREFUSED" });
  });

  it("fails as a TimeoutError when its API's time runs out", async () => {
    const error = await failureOf(api(upstream.url, { timeout: 50 }).silent());

    expect(isTimeoutError(error)).toBe(true);
  });

  it("is answered, and its answer not cached, when the cache cannot copy the data", async () => {
    const withMethod = defineMiddleware("describe", "after", (_ctx, response) => ({
      ...response,
      data: { ...Object(response.data), describe: () => "count" },
    }));
    const client = createCaller(
      defineApi({
        baseURL: upstream.url,
        middleware: [cacheMiddleware({ scope: "public" }), withMethod],
        endpoints: { count: endpoint.get("count").response<{ count: number }>() },
      }),
    );

    await expect(client.count()).resolves.toMatchObject({ count: 1 });
    await expect(client.count()).resolves.toMatchObject({ count: 2 });
  });
});

describe("the logger", () => {
  it("writes a failure of Node's fetch as an error, its cause with it", async () => {
    const record = serializeError(await failureOf(fetch(nowhere)));

    expect(record).toMatchObject({
      name: "TypeError",
      message: "fetch failed",
      cause: { code: "ECONNREFUSED" },
    });
  });
});
