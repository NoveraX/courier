/**
 * The cache middleware's Studio events name the request they belong to, so
 * Studio can show which request was served from the cache. They named the
 * endpoint instead, which no request carries.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import { cacheMiddleware } from "../../src/middleware";
import { studioHooks } from "../../src/studio";
import type { StudioHooks } from "../../src/studio/hooks";

const { endpoint } = courier();

let upstream: Server;
let saved: StudioHooks;
const started = vi.fn();
const hit = vi.fn();
const miss = vi.fn();
const stored = vi.fn();

interface Client {
  config: () => Promise<unknown>;
}

beforeEach(async () => {
  upstream = createServer((_req, res) => res.end(JSON.stringify({ version: 1 })));
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  saved = { ...studioHooks };
  Object.assign(studioHooks, {
    onRequestStart: started,
    onCacheHit: hit,
    onCacheMiss: miss,
    onCacheStore: stored,
  });
});

afterEach(async () => {
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
  Object.assign(studioHooks, saved);
  for (const spy of [started, hit, miss, stored]) spy.mockReset();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("the cache middleware's Studio events", () => {
  it("name the request that missed, was stored, and was then served from the cache", async () => {
    const api = defineApi({
      baseURL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      endpoints: {
        config: endpoint
          .get("config")
          .use(cacheMiddleware({ scope: "public" }))
          .response<unknown>(),
      },
    });
    const client = createCaller(api) as unknown as Client;

    await client.config();
    await client.config();

    const [first, second] = started.mock.calls.map(([event]) => event.id);
    expect(miss.mock.calls[0]?.[0].requestId).toBe(first);
    expect(stored.mock.calls[0]?.[0].requestId).toBe(first);
    expect(hit.mock.calls[0]?.[0].requestId).toBe(second);
  });
});
