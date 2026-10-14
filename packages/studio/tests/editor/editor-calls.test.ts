/**
 * Where the code calls an endpoint, as an editor is told: a member chain
 * that ends with the endpoint's names — after a caller the file creates,
 * the source's name, or anything else — and a query hook that names the
 * endpoint; in scripts and in Vue, Svelte and Astro components; each placed
 * by line and column, which count as an editor counts.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { codeCalls } from "../../src/server/editor/calls-in-text";
import { endpointCatalog } from "../../src/server/editor/endpoint-catalog";
import { matchCalls } from "../../src/server/editor/match-calls";

const { endpoint } = courier();
const Order = z.object({ id: z.string() });

const sources = {
  shop: defineApi({
    baseURL: "https://shop.example",
    endpoints: { health: endpoint.get("health").response(z.object({ ok: z.boolean() })) },
    groups: {
      orders: defineGroup({
        prefix: "orders",
        endpoints: {
          place: endpoint.post("").response(Order),
          get: endpoint
            .get(":id")
            .variables(z.object({ id: z.string() }))
            .response(Order),
        },
      }),
      account: defineGroup({
        prefix: "account",
        endpoints: { me: endpoint.get("me").response(Order) },
      }),
    },
  }),
  payments: defineApi({
    baseURL: "https://pay.example",
    groups: {
      account: defineGroup({
        prefix: "account",
        endpoints: { me: endpoint.get("me").response(Order) },
      }),
    },
  }),
};
const catalog = endpointCatalog(sources);

function calls(fileName: string, text: string) {
  return matchCalls(codeCalls(fileName, text), catalog, text).map((call) => ({
    at: `${call.line}:${call.column}`,
    endpoints: call.endpoints.map((e) => `${e.source} ${e.endpoint}`),
  }));
}

describe("the endpoint calls in a file", () => {
  it("finds a call through a caller the file creates, placed where the endpoint's name is written", () => {
    const text = [
      'const note = "naïve — ünïcode first";',
      "const storefront = createProxyCaller(shopRoutes);",
      "await storefront.orders.place({ sku: 'A' });",
    ].join("\n");

    expect(calls("cart.ts", text)).toEqual([{ at: "3:25", endpoints: ["shop orders.place"] }]);
  });

  it("settles which source by the name written before the endpoint's, and offers both without it", () => {
    const text = "await backend.payments.account.me();\nawait api.account.me();\n";

    expect(calls("account.ts", text)).toEqual([
      { at: "1:32", endpoints: ["payments account.me"] },
      { at: "2:19", endpoints: ["shop account.me", "payments account.me"] },
    ]);
  });

  it("reads the endpoint a query hook names, in a component's script", () => {
    const vue = [
      "<template><p>{{ data }}</p></template>",
      '<script setup lang="ts">',
      'const { data } = q.orders.useQuery("get", { variables: { id } });',
      "</script>",
    ].join("\n");

    expect(calls("Order.vue", vue)).toEqual([{ at: "3:36", endpoints: ["shop orders.get"] }]);
  });

  it("matches a top-level endpoint only through a caller or its source's name, never a method of anything", () => {
    const text = [
      "const shopCaller = createCaller(shop);",
      "await shopCaller.health();",
      "await anything.health();",
      "await clients.shop.health();",
      "cache.get(key); items.place();",
    ].join("\n");

    expect(calls("health.ts", text)).toEqual([
      { at: "2:18", endpoints: ["shop health"] },
      { at: "4:20", endpoints: ["shop health"] },
    ]);
  });

  it("finds nothing in a file that does not parse, nor in a call that is not a member chain", () => {
    expect(calls("broken.ts", "await api.orders.place(")).toEqual([]);
    expect(calls("plain.ts", "place(); get(1);")).toEqual([]);
  });
});
