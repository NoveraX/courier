/**
 * Routes are checked against the API they were written from — a path it
 * does not define, or a shape it declares otherwise, does not compile — and
 * a proxy client given them is typed from that API with the endpoints they
 * name alone.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type CourierRoutes,
  courier,
  defineApi,
  defineGroup,
  type RouteMap,
} from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";

const { endpoint, stream } = courier();

const api = defineApi({
  baseURL: "https://api.example.com",
  groups: {
    orders: defineGroup({
      prefix: "orders",
      endpoints: {
        list: endpoint.get("").response<{ id: number }[]>().cache({ revalidate: 30 }),
        create: endpoint.post("").variables<{ item: string }>().response<{ id: number }>(),
        purge: endpoint.del(""),
        feed: stream.get("feed").response<{ id: number }>(),
      },
    }),
  },
});

const endpoints = {
  "orders.list": { type: "query", get: true },
  "orders.create": { type: "mutation" },
  "orders.feed": { transport: "sse" },
} as const satisfies RouteMap<typeof api>;

const apiRoutes: CourierRoutes<typeof api, typeof endpoints> = { source: "api", endpoints };

describe("routes written for an API", () => {
  it("name only the API's endpoints, each in the shape it declares", () => {
    // @ts-expect-error — the API declares no orders.lsit
    const misspelt = { "orders.lsit": { type: "query" } } as const satisfies RouteMap<typeof api>;
    // @ts-expect-error — orders.create writes, so it is not a read
    const notARead = { "orders.create": { type: "query" } } as const satisfies RouteMap<typeof api>;
    // @ts-expect-error — orders.feed is a stream, reached as server-sent events
    const notAStream = { "orders.feed": { type: "query" } } as const satisfies RouteMap<typeof api>;

    expect([misspelt, notARead, notAStream]).toHaveLength(3);
  });

  it("give a proxy client the endpoints they name, and no other", () => {
    const client = createProxyCaller(apiRoutes);

    expectTypeOf(client.orders.list).returns.resolves.toEqualTypeOf<{ id: number }[]>();
    expectTypeOf(client.orders.create).parameter(0).toEqualTypeOf<{ item: string }>();
    // @ts-expect-error — the routes do not name orders.purge, and the proxy refuses it
    expect(() => client.orders.purge()).toThrow(/routes/);
  });
});
