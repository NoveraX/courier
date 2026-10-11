/**
 * What the `agents` policy decides for each endpoint, in its order: a deny
 * pattern, `.agent(false)`, the access ceiling, `.agent()`, an allow
 * pattern, `offer` — the first rule that speaks deciding it.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { eachEndpoint } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import { decideEndpoint, impliedAccess } from "../../src/policy/agent-decision";
import { checkedPolicy } from "../../src/policy/checked-policy";

const { endpoint, stream } = courier();

const shop = defineApi({
  name: "shop",
  baseURL: "https://s.example",
  groups: {
    orders: defineGroup({
      prefix: "orders",
      endpoints: {
        get: endpoint.get(":id"),
        search: endpoint.post("search").reads(),
        create: endpoint.post(""),
        cancel: endpoint.del(":id"),
        refund: endpoint
          .post(":id/refund")
          .agent({ description: "Refund an order", access: "destructive" }),
        export: endpoint.get("export").agent(false),
        feed: stream.response<number>().get("feed"),
      },
    }),
  },
});

function decided(agents: unknown): Record<string, unknown> {
  const policy = checkedPolicy(agents);
  return Object.fromEntries(
    [...eachEndpoint(shop)].map((placed) => {
      const decision = decideEndpoint(placed, `shop.${placed.id}`, policy);
      return [placed.id, decision.offered ? `${decision.by} ${decision.access}` : decision.by];
    }),
  );
}

describe("the policy's decision", () => {
  it("offers the marked endpoints alone by default, never a stream or one marked false", () => {
    expect(decided(undefined)).toEqual({
      "orders.get": "unmarked",
      "orders.search": "unmarked",
      "orders.create": "unmarked",
      "orders.cancel": "unmarked",
      "orders.refund": "marked destructive",
      "orders.export": "opted-out",
      "orders.feed": "kind",
    });
  });

  it("offers every read with offer reads — a read over POST among them — and every endpoint with all", () => {
    expect(decided({ offer: "reads" })).toMatchObject({
      "orders.get": "offer read",
      "orders.search": "offer read",
      "orders.create": "unmarked",
      "orders.cancel": "unmarked",
    });
    expect(decided({ offer: "all" })).toMatchObject({
      "orders.create": "offer write",
      "orders.cancel": "offer destructive",
      "orders.export": "opted-out",
      "orders.feed": "kind",
    });
  });

  it("lets a deny pattern win over everything, and an allow pattern offer what offer leaves out", () => {
    expect(
      decided({ offer: "all", allow: ["shop.orders.create"], deny: ["shop.orders.re*"] }),
    ).toMatchObject({ "orders.refund": "deny", "orders.create": "allow write" });
    expect(decided({ allow: ["shop.orders.c*"] })).toMatchObject({
      "orders.create": "allow write",
      "orders.cancel": "allow destructive",
      "orders.get": "unmarked",
    });
  });

  it("keeps out what does more than the access ceiling, marked or not", () => {
    expect(decided({ offer: "all", access: "write" })).toMatchObject({
      "orders.refund": "ceiling",
      "orders.cancel": "ceiling",
      "orders.create": "offer write",
    });
    expect(decided({ offer: "all", access: "read" })).toMatchObject({
      "orders.create": "ceiling",
      "orders.get": "offer read",
    });
  });

  it("has a person confirm from the access confirm names", () => {
    const policy = checkedPolicy({ offer: "all", confirm: "write" });
    const confirms = [...eachEndpoint(shop)].flatMap((placed) => {
      const decision = decideEndpoint(placed, `shop.${placed.id}`, policy);
      return decision.offered && decision.confirm ? [placed.id] : [];
    });

    expect(confirms).toEqual(["orders.create", "orders.cancel", "orders.refund"]);
  });

  it("takes the access an unmarked endpoint's verb implies", () => {
    const accesses = [...eachEndpoint(shop)]
      .filter((placed) => placed.kind !== "stream")
      .map((placed) => `${placed.id} ${impliedAccess(placed)}`);

    expect(accesses).toEqual([
      "orders.get read",
      "orders.search read",
      "orders.create write",
      "orders.cancel destructive",
      "orders.refund write",
      "orders.export read",
    ]);
  });
});
