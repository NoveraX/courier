/**
 * `createProxyCaller` for an API with streams or channels.
 *
 * The type argument names each endpoint's transport, but only a runtime value
 * tells the client which endpoints to open as a stream. Without `source` or
 * `boundary`, a call typed as a subscription went out as a plain HTTP request
 * and every member of the declared type was undefined — with no error at
 * compile time or at startup.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { defineBoundary } from "../src/define/boundary";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import type { SSESubscription } from "../src/realtime/types";

const { endpoint, stream } = courier();

const live = defineApi({
  baseURL: "https://upstream.example",
  groups: {
    ticks: defineGroup({ endpoints: { feed: stream.get("feed").response<number>() } }),
  },
});

const plain = defineApi({
  baseURL: "https://upstream.example",
  endpoints: { list: endpoint.get("list").response<string[]>() },
});

describe("the options argument", () => {
  it("is required when the API has a stream", () => {
    const typeOnly = () => {
      // @ts-expect-error — no way to tell which endpoints are streams
      createProxyCaller<typeof live>("live");
      // @ts-expect-error — the same, with options that name neither
      createProxyCaller<typeof live>("live", { timeout: 1000 });

      const withSource = createProxyCaller<typeof live>("live", { source: live });
      expectTypeOf(withSource.ticks.feed).returns.toEqualTypeOf<SSESubscription<number>>();

      const boundary = defineBoundary({
        source: "live",
        expose: { "ticks.feed": "stream" },
      });
      createProxyCaller<typeof live>("live", { boundary });
    };
    expect(typeOnly).toBeTypeOf("function");
  });

  it("stays optional for an API of plain requests", () => {
    const typeOnly = () => {
      createProxyCaller<typeof plain>("plain");
      createProxyCaller<typeof plain>("plain", { timeout: 1000 });
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});

/**
 * Handed the API itself as `source`, the client takes its type from it; it
 * used to come out untyped unless the type was also named.
 */
describe("a client given the API as its source", () => {
  it("is typed from it without a type argument", () => {
    const typeOnly = () => {
      const client = createProxyCaller("live", { source: live });
      expectTypeOf(client.ticks.feed).returns.toEqualTypeOf<SSESubscription<number>>();

      const flat = createProxyCaller("plain", { source: plain });
      expectTypeOf(flat.list).returns.resolves.toEqualTypeOf<string[]>();
      // @ts-expect-error — the API has no such endpoint
      flat.missing();
    };
    expect(typeOnly).toBeTypeOf("function");
  });
});
