/**
 * A source's endpoints as the Courier view shows them: the groups their
 * calls name, nested as deep as the calls go, in the order Studio lists
 * them, and the counts each group sums up.
 */
import { describe, expect, it } from "vitest";

import type { EndpointStats } from "../src/studio/studio-types";
import { groupEndpoints, tallyOf } from "../src/view/endpoint-groups";

const stats = (endpoint: string, calls = 1, failed = 0): EndpointStats => ({
  source: "shop",
  endpoint,
  calls,
  failed,
  pending: 0,
  statuses: {},
});

describe("a source's endpoints, by group", () => {
  const root = groupEndpoints([
    stats("health"),
    stats("products.list"),
    stats("products.get", 3, 1),
    stats("admin.orders.list", 0),
    stats("cart.add", 2, 2),
  ]);

  it("nests each endpoint in the groups its call names, at the source when it names none", () => {
    expect(root.endpoints.map((e) => e.endpoint)).toEqual(["health"]);
    expect(root.groups.map((g) => g.name)).toEqual(["products", "admin", "cart"]);
    const admin = root.groups[1];
    expect(admin?.groups.map((g) => g.path)).toEqual(["admin.orders"]);
    expect(admin?.groups[0]?.endpoints.map((e) => e.endpoint)).toEqual(["admin.orders.list"]);
  });

  it("sums a group's endpoints, those with a failed call and those called, inner groups included", () => {
    expect(tallyOf(root)).toEqual({ endpoints: 5, failing: 2, called: 4 });
    expect(tallyOf(root.groups[0] as (typeof root.groups)[number])).toEqual({
      endpoints: 2,
      failing: 1,
      called: 2,
    });
  });
});
