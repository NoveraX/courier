/**
 * The client type `createProxyCaller` infers from an API's type.
 *
 * A source's endpoints are read without a string index signature, so a flat
 * or a mixed proxy client has a member only for each endpoint it declares: a
 * typo, or any name on a source defined with no endpoints yet, fails to
 * compile rather than once the request reaches the server.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";

const { endpoint } = courier();

const empty = defineApi({ baseURL: "https://api.example.com", endpoints: {} });

const flat = defineApi({
  baseURL: "https://api.example.com",
  endpoints: { ping: endpoint.get("ping").response<{ ok: boolean }>() },
});

const mixed = defineApi({
  baseURL: "https://api.example.com",
  groups: { users: defineGroup({ endpoints: { list: endpoint.get("").response<string[]>() } }) },
  endpoints: { ping: endpoint.get("ping").response<{ ok: boolean }>() },
});

describe("a proxy client for a flat source", () => {
  it("has no members when the source has no endpoints", () => {
    const typeOnly = () => {
      const client = createProxyCaller<typeof empty>("empty");
      // @ts-expect-error the source declares no endpoint of that name
      client.anything;
      client.raw;
      client.with({ timeout: 1000 });
    };

    expect(typeOnly).toBeTypeOf("function");
  });

  it("has exactly the endpoints the source declares", () => {
    const typeOnly = () => {
      const client = createProxyCaller<typeof flat>("flat");
      expectTypeOf(client.ping).returns.toEqualTypeOf<Promise<{ ok: boolean }>>();
      // @ts-expect-error the source declares no endpoint of that name
      client.pong;
    };

    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("a proxy client for a mixed source", () => {
  it("has exactly the groups and endpoints the source declares", () => {
    const typeOnly = () => {
      const client = createProxyCaller<typeof mixed>("mixed");
      expectTypeOf(client.users.list).returns.toEqualTypeOf<Promise<string[]>>();
      expectTypeOf(client.ping).returns.toEqualTypeOf<Promise<{ ok: boolean }>>();
      // @ts-expect-error the source declares no endpoint of that name
      client.pong;
    };

    expect(typeOnly).toBeTypeOf("function");
  });
});
