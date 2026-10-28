/**
 * An API's type knows which endpoints a page may call: each `.expose()`
 * mark is kept in the endpoint's type wherever the chain names it, a
 * group's and an API's `expose` are kept as written, and `ExposedPaths`
 * reads them by the rule the proxy applies — the endpoint's own mark, the
 * nearest group's, the API's, none keeping the endpoint the server's. The
 * routes built from the definition name exactly the same endpoints, so a
 * page's client is typed with what the proxy serves.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type ChannelEndpoint,
  type CourierRoutes,
  courier,
  type DefinedApi,
  defineApi,
  defineGroup,
  type ExposedPaths,
  type ExposedRoutes,
  type HttpAddressed,
  type HttpEndpoint,
  type InferExpose,
  type RouteShape,
  type StreamEndpoint,
} from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";

const { endpoint, stream, channel } = courier();

/** The paths the routes built from an API name, sorted. */
function routedPaths(api: object): string[] {
  return Object.keys(routesOf(api, "api").endpoints);
}

describe("an endpoint's .expose() mark", () => {
  it("is kept in its type wherever the chain names it", () => {
    const beforeVerb = endpoint.expose().get("a").response<number>().cache({ revalidate: 1 });
    const afterVerb = endpoint.get("a").expose().variables<{ q: string }>().timeout(5);
    const last = endpoint.post("a").response<number>().use().reads().cancelPrevious().expose();
    const shut = endpoint.get("a").expose(false).agent(false).meta({ by: "test" });

    expectTypeOf<InferExpose<typeof beforeVerb>>().toEqualTypeOf<true>();
    expectTypeOf<InferExpose<typeof afterVerb>>().toEqualTypeOf<true>();
    expectTypeOf<InferExpose<typeof last>>().toEqualTypeOf<true>();
    expectTypeOf<InferExpose<typeof shut>>().toEqualTypeOf<false>();
  });

  it("is kept on streams and channels, before and after their address", () => {
    const ticks = stream.response<number>().expose().get("ticks");
    const served = stream
      .response<number>()
      .expose(false)
      .implement(async function* () {});
    const chat = channel.connect("chat").send<string>().response<string>().expose();

    expectTypeOf<InferExpose<typeof ticks>>().toEqualTypeOf<true>();
    expectTypeOf<InferExpose<typeof served>>().toEqualTypeOf<false>();
    expectTypeOf<InferExpose<typeof chat>>().toEqualTypeOf<true>();
  });

  it("handed a flag, opens for true alone, and may open for a flag that may be true", () => {
    const settings: { searchPublic?: boolean; reportsPublic?: false } = {};
    const mayOpen = endpoint.get("a").expose(settings.searchPublic);
    const handedUndefined = endpoint.get("a").expose(undefined);
    const shutOrLeftOut = endpoint.get("a").expose(settings.reportsPublic);

    expectTypeOf<InferExpose<typeof mayOpen>>().toEqualTypeOf<boolean>();
    expectTypeOf<InferExpose<typeof handedUndefined>>().toEqualTypeOf<false>();
    expectTypeOf<InferExpose<typeof shutOrLeftOut>>().toEqualTypeOf<false>();
  });

  it("is undefined where the endpoint says nothing, and boolean for a flag known at run time", () => {
    const unmarked = endpoint.get("a").response<number>();
    const flagged = endpoint.get("a").expose(Date.now() > 0);

    expectTypeOf<InferExpose<typeof unmarked>>().toEqualTypeOf<undefined>();
    expectTypeOf<InferExpose<typeof flagged>>().toEqualTypeOf<boolean>();
  });
});

describe("the types an endpoint is annotated with", () => {
  it("take an endpoint whatever its mark, as they did before marks were typed", () => {
    const listOf = <T>(path: string): HttpEndpoint<T[], void, "query"> =>
      endpoint.get(path).response<T[]>().expose();
    const ticks: StreamEndpoint<number, void> = stream.get("ticks").response<number>().expose();
    const chat: ChannelEndpoint<string, void, string> = channel
      .connect("chat")
      .response<string>()
      .send<string>()
      .expose(false);
    const one: HttpAddressed<void, void, void, "query"> = endpoint.get("one").expose();
    const users = {
      list: endpoint.get("users").response<{ id: number }[]>().expose(),
      create: endpoint.post("users"),
    } satisfies Record<string, HttpEndpoint<unknown, void, "query" | "mutation">>;
    type ResponseOf<E> = E extends HttpEndpoint<infer TResponse, void, "query"> ? TResponse : never;

    expectTypeOf<ResponseOf<typeof users.list>>().toEqualTypeOf<{ id: number }[]>();
    expect([listOf("items"), ticks, chat, one]).toHaveLength(4);
  });
});

describe("a group's and an API's expose", () => {
  it("is kept as written", () => {
    const open = defineGroup({ expose: true, endpoints: { a: endpoint.get("a") } });
    const plain = defineGroup({ endpoints: { a: endpoint.get("a") } });
    const api = defineApi({ expose: false, groups: { open } });

    expectTypeOf(open.options.expose).toEqualTypeOf<true | undefined>();
    expectTypeOf(plain.options.expose).toEqualTypeOf<undefined>();
    expectTypeOf(api.options.expose).toEqualTypeOf<false | undefined>();
  });
});

describe("ExposedPaths", () => {
  it("names the endpoints the nearest mark opens, as the routes do", () => {
    const api = defineApi({
      expose: true,
      endpoints: { health: endpoint.get("health") },
      groups: {
        users: defineGroup({
          endpoints: {
            list: endpoint.get("users"),
            purge: endpoint.del("users").expose(false),
            export: endpoint.expose(false).get("users/export"),
          },
        }),
        admin: defineGroup({
          expose: false,
          endpoints: { audit: endpoint.get("audit"), search: endpoint.get("search").expose() },
          groups: {
            reports: defineGroup({ endpoints: { daily: endpoint.get("daily") } }),
            open: defineGroup({ expose: true, endpoints: { summary: endpoint.get("summary") } }),
          },
        }),
        live: defineGroup({
          endpoints: {
            ticks: stream.get("ticks").response<number>(),
            chat: channel.connect("chat").send<string>().expose(false),
          },
        }),
      },
    });

    expectTypeOf<ExposedPaths<typeof api>>().toEqualTypeOf<
      "admin.open.summary" | "admin.search" | "health" | "live.ticks" | "users.list"
    >();
    expect(routedPaths(api)).toEqual([
      "admin.open.summary",
      "admin.search",
      "health",
      "live.ticks",
      "users.list",
    ]);
  });

  it("leaves to the group an endpoint only one branch of a condition marks", () => {
    const lockdown = Date.now() < 0;
    const api = defineApi({
      groups: {
        search: defineGroup({
          expose: true,
          endpoints: { query: lockdown ? endpoint.get("q").expose(false) : endpoint.get("q") },
        }),
      },
    });

    expectTypeOf<ExposedPaths<typeof api>>().toEqualTypeOf<"search.query">();
    expect(routedPaths(api)).toEqual(["search.query"]);
  });

  it("names what a group's flag that may be left out leaves to the API above", () => {
    const settings: { reportsPublic?: false } = {};
    const api = defineApi({
      expose: true,
      groups: {
        reports: defineGroup({
          expose: settings.reportsPublic,
          endpoints: { daily: endpoint.get("daily") },
        }),
      },
    });

    expectTypeOf<ExposedPaths<typeof api>>().toEqualTypeOf<"reports.daily">();
    expect(routedPaths(api)).toEqual(["reports.daily"]);
  });

  it("takes an expose forwarded from settings that may leave it out", () => {
    const settings: { expose?: boolean } = {};
    const users = defineGroup({ expose: settings.expose, endpoints: { list: endpoint.get("") } });
    const api = defineApi({ expose: settings.expose, groups: { users } });

    expectTypeOf<ExposedPaths<typeof api>>().toEqualTypeOf<"users.list">();
    expect(routedPaths(api)).toEqual([]);
  });

  it("follows groups ten deep, as the paths of an API do", () => {
    const deepest = defineGroup({ endpoints: { e10: endpoint.get("e10") } });
    const nine = defineGroup({ endpoints: { e9: endpoint.get("e9") }, groups: { g10: deepest } });
    const eight = defineGroup({ groups: { g9: nine } });
    const seven = defineGroup({ groups: { g8: eight } });
    const six = defineGroup({ groups: { g7: seven } });
    const five = defineGroup({ groups: { g6: six } });
    const four = defineGroup({ groups: { g5: five } });
    const three = defineGroup({ groups: { g4: four } });
    const two = defineGroup({ groups: { g3: three } });
    const one = defineGroup({ groups: { g2: two } });
    const api = defineApi({ expose: true, groups: { g1: one } });

    expectTypeOf<ExposedPaths<typeof api>>().toEqualTypeOf<
      "g1.g2.g3.g4.g5.g6.g7.g8.g9.e9" | "g1.g2.g3.g4.g5.g6.g7.g8.g9.g10.e10"
    >();
    expect(routedPaths(api)).toEqual([
      "g1.g2.g3.g4.g5.g6.g7.g8.g9.e9",
      "g1.g2.g3.g4.g5.g6.g7.g8.g9.g10.e10",
    ]);
  });

  it("names nothing where no mark opens an endpoint", () => {
    const api = defineApi({
      groups: { users: defineGroup({ endpoints: { list: endpoint.get("") } }) },
    });

    expectTypeOf<ExposedPaths<typeof api>>().toBeNever();
    expect(routedPaths(api)).toEqual([]);
  });

  it("names an endpoint a flag known only at run time may open, leaving it to the routes", () => {
    const flag = Date.now() < 0;
    const api = defineApi({
      groups: { users: defineGroup({ expose: flag, endpoints: { list: endpoint.get("") } }) },
    });

    expectTypeOf<ExposedPaths<typeof api>>().toEqualTypeOf<"users.list">();
    expect(routedPaths(api)).toEqual([]);
  });
});

describe("ExposedRoutes", () => {
  it("name any endpoint for an API typed to hold any endpoint", () => {
    expectTypeOf<ExposedRoutes<DefinedApi>>().toEqualTypeOf<
      CourierRoutes<DefinedApi, Readonly<Record<string, RouteShape>>>
    >();
  });
});

describe("a proxy client given ExposedRoutes", () => {
  it("reaches the endpoints the marks open, and no other", () => {
    const api = defineApi({
      expose: true,
      groups: {
        orders: defineGroup({
          endpoints: {
            list: endpoint.get("").response<{ id: number }[]>(),
            refund: endpoint.post("refund").expose(false),
          },
        }),
      },
    });
    const routes = routesOf(api, "api") as unknown as ExposedRoutes<typeof api>;

    const client = createProxyCaller(routes);

    expectTypeOf(client.orders.list).returns.resolves.toEqualTypeOf<{ id: number }[]>();
    // @ts-expect-error — orders.refund is marked .expose(false), and the proxy refuses it
    expect(() => client.orders.refund()).toThrow(/routes/);
  });
});
