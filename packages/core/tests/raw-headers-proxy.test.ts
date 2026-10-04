/**
 * `.raw` over the proxy: the headers arrive as `Headers`, not as the `{}` a
 * `Headers` serializes to, so `.get()` works and the rate-limit, ETag and
 * pagination headers are there to read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";
let upstreamAnswer: () => Response;

const api = defineApi({
  baseURL: UPSTREAM,
  groups: {
    items: defineGroup({
      endpoints: {
        list: endpoint.get("list").response<unknown>(),
        typed: endpoint.get("typed").response(z.object({ id: z.number() })),
      },
    }),
  },
});

interface Client {
  items: { list: () => Promise<unknown> };
  raw: { items: { list: () => Promise<{ status: number; headers: Headers; data: unknown }> } };
}

beforeEach(() => {
  registerSources({ api });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(UPSTREAM)) return upstreamAnswer();
    return handler.handle(new Request(new URL(url, "http://app.local"), init));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe(".raw over the proxy", () => {
  it("hands back real Headers carrying what the upstream sent", async () => {
    upstreamAnswer = () =>
      Response.json([1], { headers: { etag: '"abc"', "x-ratelimit-remaining": "42" } });
    const client = createProxyCaller("api") as unknown as Client;

    const result = await client.raw.items.list();

    expect(result.headers).toBeInstanceOf(Headers);
    expect(result.headers.get("etag")).toBe('"abc"');
    expect(result.headers.get("x-ratelimit-remaining")).toBe("42");
    expect(result.data).toEqual([1]);
  });
});
