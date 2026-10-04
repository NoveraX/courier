/**
 * What the root entry offers: the API, and not the proxy transport's own call
 * function or the types it is typed with, which are Courier's plumbing
 * rather than something an application calls.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import type { BaseOptions, SearchParamsSerializer } from "../src";
import * as courier from "../src";
import * as internal from "../src/internal";
import type { CacheEntry, CacheOptions, CacheScope, CacheStore } from "../src/middleware";
import type { WSConnection } from "../src/realtime";
import * as realtime from "../src/realtime";

/* The proxy transport's call types are its own: naming one from the root entry does not compile. */
// @ts-expect-error not exported
export type NoCallerFn = courier.CallerFn;
// @ts-expect-error not exported
export type NoEndpointKey = courier.EndpointKey;
// @ts-expect-error not exported
export type NoResolveEndpoint = courier.ResolveEndpoint;
// @ts-expect-error not exported
export type NoSuccessResponse = courier.SuccessResponse;
// @ts-expect-error not exported
export type NoUntypedCallerFn = courier.UntypedCallerFn;

describe("the root entry", () => {
  it("keeps the proxy transport's call function to itself", () => {
    expect(Object.keys(courier)).not.toContain("createProxyCallerFn");
    expect(Object.keys(courier)).toContain("createProxyCaller");
  });
});

/**
 * The options a source and the cache middleware take are typed by names the
 * entries export, so a shared options object or a custom cache store names
 * its type rather than spelling it out by hand.
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
 * A WebSocket connection subscribes and sends. It offers no request and
 * response — a message sent with an id, answered by a frame carrying it
 * back — since no Courier server answers so: a channel replies with `send`,
 * which carries no id, and every such request would wait out its timeout.
 */
describe("the realtime entry", () => {
  it("offers no request a server never answers", () => {
    expectTypeOf<"request" extends keyof WSConnection ? true : false>().toEqualTypeOf<false>();
    expect(Object.keys(realtime)).not.toContain("createPendingRegistry");
  });

  it("keeps the wire protocol and the client's parts to Courier's own packages", () => {
    const parts = [
      "encodeMessage",
      "decodeMessage",
      "describeFailure",
      "createConnectionState",
      "SSE_CONTROL_EVENTS",
    ];

    expect(Object.keys(realtime).filter((name) => parts.includes(name))).toEqual([]);
    expect(parts.filter((name) => !(name in internal))).toEqual([]);
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
    for (const gone of [
      "composeBackend",
      "parseEndpointKey",
      "requireSources",
      "abortPlayground",
    ]) {
      expect(Object.keys(courier)).not.toContain(gone);
    }
  });

  it("is reached through the internal entry", () => {
    expect(PLUMBING.filter((name) => !(name in internal))).toEqual([]);
  });

  it("offers the stream and channel factories that load their clients on the first call", () => {
    const eager = [
      "createDirectSSEFactory",
      "createDirectWSChannelFactory",
      "createProxySSEFactory",
      "createProxyWSChannelFactory",
      "clearWSConnectionPool",
    ];

    expect(Object.keys(internal).filter((name) => eager.includes(name))).toEqual([]);
    expect(
      ["directStreamingFactories", "proxyStreamingFactories"].filter((name) => !(name in internal)),
    ).toEqual([]);
  });
});
