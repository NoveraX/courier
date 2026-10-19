/**
 * The groups still generated once endpoints are left out: each group that
 * keeps one, and every group it sits inside — found without recursion, each
 * group once, so a chain of parents that loops back ends.
 */
import { describe, expect, it } from "vitest";

import { groupsHoldingEndpoints } from "../../src/apis/generator/groups-holding-endpoints";
import type { ParsedEndpoint, ParsedGroup } from "../../src/apis/parser/types";

const ENDPOINT = { name: "list" } as ParsedEndpoint;

function group(name: string, parent: string | undefined, endpoints: number): ParsedGroup {
  return {
    name,
    description: "",
    prefix: "",
    endpoints: Array.from({ length: endpoints }, () => ENDPOINT),
    ...(parent !== undefined && { parent }),
  };
}

describe("groupsHoldingEndpoints", () => {
  it("keeps each group with an endpoint and every group it sits in", () => {
    const groups = [
      group("billing", undefined, 0),
      group("invoices", "billing", 0),
      group("lines", "invoices", 1),
      group("refunds", "billing", 0),
    ];

    expect([...groupsHoldingEndpoints(groups)].sort()).toEqual(["billing", "invoices", "lines"]);
  });

  it("follows a parent the list does not hold, and keeps no group no endpoint sits in", () => {
    const held = groupsHoldingEndpoints([group("pets", "ghost", 1), group("store", undefined, 0)]);

    expect([...held].sort()).toEqual(["ghost", "pets"]);
  });

  it("ends on a chain of parents that loops back", () => {
    const looped = [group("a", "b", 1), group("b", "a", 0), group("c", "c", 1)];

    expect([...groupsHoldingEndpoints(looped)].sort()).toEqual(["a", "b", "c"]);
  });

  it("walks a chain of 100 000 groups without recursion", () => {
    const chain = Array.from({ length: 100_000 }, (_, at) =>
      group(`g${at}`, at === 0 ? undefined : `g${at - 1}`, at === 99_999 ? 1 : 0),
    );

    expect(groupsHoldingEndpoints(chain).size).toBe(100_000);
  });
});
