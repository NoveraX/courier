/**
 * A scenario's endpoints bucketed by group. Group names are the
 * developer's, so a name every object inherits is a group like any other.
 */
import { describe, expect, it } from "vitest";

import type { MockScenarioEndpoint } from "../src/store/mock-slice";

import { groupByField } from "../src/views/mocks/scenarios/scenario-detail-endpoints";

function endpoint(group: string, name: string): MockScenarioEndpoint {
  return { group, endpoint: name, httpMethod: "GET", behavior: "returns" };
}

describe("groupByField", () => {
  it("buckets endpoints by group, in the order each group first appears", () => {
    const groups = groupByField([
      endpoint("users", "list"),
      endpoint("posts", "list"),
      endpoint("users", "get"),
    ]);

    expect([...groups.keys()]).toEqual(["users", "posts"]);
    expect(groups.get("users")?.map((ep) => ep.endpoint)).toEqual(["list", "get"]);
  });

  it("keeps a group named like an inherited member, such as constructor or toString, as its own", () => {
    const groups = groupByField([
      endpoint("constructor", "create"),
      endpoint("toString", "render"),
      endpoint("constructor", "destroy"),
    ]);

    expect(groups.get("constructor")?.map((ep) => ep.endpoint)).toEqual(["create", "destroy"]);
    expect(groups.get("toString")?.map((ep) => ep.endpoint)).toEqual(["render"]);
  });
});
