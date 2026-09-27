import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../../src/caller";
import { courier } from "../../src/define/courier";
import { defineApi } from "../../src/define/api";
import { cacheMiddleware, defineMiddleware } from "../../src/middleware/index";
import type { Middleware } from "../../src/middleware/types";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();

interface Counted {
  count: number;
  tags: string[];
}

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/** An upstream counting how often it was asked. */
async function counting(): Promise<Upstream> {
  upstream = await startUpstream((_req, res, index) =>
    sendJson(res, 200, { count: index + 1, tags: ["a"] }),
  );
  return upstream;
}

function clientFor(url: string, middleware: Middleware[]) {
  return createCaller(
    defineApi({
      name: "api",
      baseURL: url,
      middleware,
      endpoints: { count: endpoint.get("count").response<Counted>() },
    }),
  );
}

describe("cacheMiddleware", () => {
  it("keeps the cached answer intact when the first caller edits theirs", async () => {
    const { url, seen } = await counting();
    const client = clientFor(url, [cacheMiddleware({ scope: "public" })]);

    const first = await client.count();
    Object.assign(first, { count: 999, injected: true });
    const second = await client.count();

    expect(second).toEqual({ count: 1, tags: ["a"] });
    expect(seen).toHaveLength(1);
  });

  it("hands every later caller a copy of its own", async () => {
    const { url, seen } = await counting();
    const client = clientFor(url, [cacheMiddleware({ scope: "public" })]);

    await client.count();
    const second = await client.count();
    const third = await client.count();

    expect(second).not.toBe(third);
    Object.assign(second, { count: 999 });
    const fourth = await client.count();
    expect(fourth).toEqual({ count: 1, tags: ["a"] });
    expect(seen).toHaveLength(1);
  });

  it("copies nested values too", async () => {
    const { url } = await counting();
    const client = clientFor(url, [cacheMiddleware({ scope: "public" })]);

    const first = await client.count();
    first.tags.push("edited");
    const second = await client.count();

    expect(second).toEqual({ count: 1, tags: ["a"] });
  });

  it("does not keep an answer holding a value it cannot copy", async () => {
    const { url, seen } = await counting();
    const withMethod = defineMiddleware("describe", "after", (_ctx, response) => ({
      ...response,
      data: { ...Object(response.data), describe: () => "count" },
    }));
    const client = clientFor(url, [cacheMiddleware({ scope: "public" }), withMethod]);

    const first = await client.count();
    const second = await client.count();

    expect(Reflect.get(first, "count")).toBe(1);
    expect(Reflect.get(second, "count")).toBe(2);
    expect(typeof Reflect.get(second, "describe")).toBe("function");
    expect(seen).toHaveLength(2);
  });
});
