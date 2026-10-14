/**
 * `createProxyCaller` for an API with streams or channels.
 *
 * The type names each endpoint's transport, and the routes say it at run
 * time too: a stream opens as a subscription, never as a plain HTTP request
 * whose result has none of the subscription's members. The client takes
 * both from its routes alone, whatever options its page gives it.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type CourierRoutes,
  courier,
  defineApi,
  defineGroup,
  type RouteMap,
} from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";
import type { SSESubscription } from "../src/realtime/types";

const { endpoint, stream } = courier();

const live = defineApi({
  baseURL: "https://upstream.example",
  expose: true,
  groups: {
    ticks: defineGroup({ endpoints: { feed: stream.get("feed").response<number>() } }),
  },
});

const plain = defineApi({
  baseURL: "https://upstream.example",
  expose: true,
  endpoints: { list: endpoint.get("list").response<string[]>() },
});

describe("a proxy client of an API with a stream", () => {
  it("opens the stream as a subscription, with options or without", () => {
    const typeOnly = () => {
      const bare = createProxyCaller(routesOf(live, "live"));
      const tuned = createProxyCaller(routesOf(live, "live"), { timeout: 1000 });

      expectTypeOf(bare.ticks.feed).returns.toEqualTypeOf<SSESubscription<number>>();
      expectTypeOf(tuned.ticks.feed).returns.toEqualTypeOf<SSESubscription<number>>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });

  it("opens it from routes written by hand, held to the API's shapes", () => {
    const typeOnly = () => {
      const endpoints = { "ticks.feed": { transport: "sse" } } as const satisfies RouteMap<
        typeof live
      >;
      const routes: CourierRoutes<typeof live, typeof endpoints> = { source: "live", endpoints };
      // @ts-expect-error — a stream is not a read
      const asRead = { "ticks.feed": { type: "query" } } as const satisfies RouteMap<typeof live>;

      expectTypeOf(createProxyCaller(routes).ticks.feed).returns.toEqualTypeOf<
        SSESubscription<number>
      >();
      expect(asRead).toBeDefined();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("a proxy client of an API of plain requests", () => {
  it("is typed from the API, the endpoints its routes name alone", () => {
    const typeOnly = () => {
      const flat = createProxyCaller(routesOf(plain, "plain"));
      expectTypeOf(flat.list).returns.resolves.toEqualTypeOf<string[]>();
      // @ts-expect-error — the API has no such endpoint
      flat.missing();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});
