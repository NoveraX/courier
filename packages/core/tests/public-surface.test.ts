/**
 * What the root entry offers. The proxy transport's own call function, typed
 * and then cast to an untyped one on its only use, and the types it was typed
 * with were exported beside the API, undocumented, while the reference
 * described them as the engine of the clients' inference.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import * as courier from "../src";
import * as internal from "../src/internal";
import * as realtime from "../src/realtime";
import type { WSConnection } from "../src/realtime";
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

/**
 * A WebSocket connection promised request and response: a message sent with
 * an id, answered by a frame carrying it back. No Courier server answers so —
 * a channel replies with `send`, which carries no id — so every request waited
 * out its timeout and failed. The connection subscribes and sends.
 */
describe("the realtime entry", () => {
  it("offers no request a server never answers", () => {
    expectTypeOf<"request" extends keyof WSConnection ? true : false>().toEqualTypeOf<false>();
    expect(Object.keys(realtime)).not.toContain("createPendingRegistry");
  });
});

/**
 * The root entry exported Courier's own plumbing beside the API — the
 * request executor, Studio's hooks, the transports and the client proxy —
 * so every internal change would have been a breaking one. Courier's
 * packages reach it through `@noverax/courier/internal`.
 */
describe("Courier's own plumbing", () => {
  const PLUMBING = [
    "buildClientProxy",
    "createDirectHTTPExecutor",
    "createProxyHTTPExecutor",
    "executeRequest",
    "normalizeHttpMethod",
    "studioHooks",
  ];

  it("is kept out of the root entry", () => {
    expect(Object.keys(courier).filter((name) => PLUMBING.includes(name))).toEqual([]);
    for (const gone of ["composeBackend", "parseEndpointKey", "requireSources", "abortPlayground"]) {
      expect(Object.keys(courier)).not.toContain(gone);
    }
  });

  it("is reached through the internal entry", () => {
    expect(PLUMBING.filter((name) => !(name in internal))).toEqual([]);
  });
});
