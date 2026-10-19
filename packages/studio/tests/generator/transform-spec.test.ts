/**
 * A selection of endpoints, grouped by tag, keeps the groups those endpoints
 * sit in — and ends on a specification whose parents loop, which a crafted
 * one may hold, where it overflowed the stack.
 */
import { describe, expect, it } from "vitest";

import { selectedEndpoints, transformSpec } from "../../src/apis/generator/transform-spec";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";

const ok = { 200: { description: "ok" } };
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.2.0",
    info: { title: "Shop", version: "1" },
    tags: [{ name: "billing" }, { name: "invoices", parent: "billing" }, { name: "store" }],
    paths: {
      "/billing/invoices": {
        get: { operationId: "listInvoices", tags: ["invoices"], responses: ok },
      },
      "/store": { get: { operationId: "listStore", tags: ["store"], responses: ok } },
    },
  }),
);

describe("transformSpec, grouped by tag", () => {
  it("keeps the groups a selected endpoint sits in, and drops the others", () => {
    const selected = selectedEndpoints(SPEC.groups, { invoices: ["listInvoices"] });

    expect(
      transformSpec(SPEC, { groupBy: "tag" }, selected).groups.map((group) => group.name),
    ).toEqual(["billing", "invoices"]);
  });

  it("selects in a specification whose parents loop, without overflowing", () => {
    const looped: ParsedSpec = {
      ...SPEC,
      groups: SPEC.groups.map((group) => ({
        ...group,
        parent: group.name === "billing" ? "invoices" : group.parent,
      })),
    };
    const selected = selectedEndpoints(looped.groups, { invoices: ["listInvoices"] });

    expect(
      transformSpec(looped, { groupBy: "tag" }, selected).groups.map((group) => group.name),
    ).toEqual(["billing", "invoices"]);
  });
});
