/**
 * What the root entry offers. The proxy transport's own call function, typed
 * and then cast to an untyped one on its only use, and the types it was typed
 * with were exported beside the API, undocumented, while the reference
 * described them as the engine of the clients' inference.
 */
import { describe, expect, it } from "vitest";

import * as courier from "../src";
import type { BaseOptions, SearchParamsSerializer } from "../src";
import type { CacheEntry, CacheOptions, CacheScope, CacheStore } from "../src/middleware";
// @ts-expect-error the proxy transport's call types are its own
import type { CallerFn, EndpointKey, ResolveEndpoint, SuccessResponse, UntypedCallerFn } from "../src";

describe("the root entry", () => {
  it("keeps the proxy transport's call function to itself", () => {
    expect(Object.keys(courier)).not.toContain("createProxyCallerFn");
    expect(Object.keys(courier)).toContain("createProxyCaller");
  });
});

/**
 * The options a source and the cache middleware take are typed by names the
 * entries did not export, so a shared options object or a custom cache store
 * had to spell its type out by hand.
 */
describe("the option types", () => {
  it("are named where the options are", () => {
    const options: BaseOptions = { baseURL: "https://api.example.com", timeout: 1_000 };
    const serializer: SearchParamsSerializer = { stringify: () => "", parse: () => ({}) };
    const store: CacheStore = new Map<string, CacheEntry>();
    const scope: CacheScope = "public";
    const cache: CacheOptions = { scope, storage: store };

    expect([options.baseURL, typeof serializer.parse, cache.storage]).toEqual([
      "https://api.example.com",
      "function",
      store,
    ]);
  });
});
