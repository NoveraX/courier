/**
 * An import's `include` and `exclude` keep the endpoints they select, and
 * every group those endpoints sit in: an OpenAPI 3.2 parent tag left with no
 * endpoint of its own stays while a tag inside it keeps one, so the import
 * is generated with its groups nested as the specification nests them.
 */
import { describe, expect, it } from "vitest";

import { filterSpec } from "../../src/apis/filter-spec";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";

const ok = { 200: { description: "ok" } };
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.2.0",
    info: { title: "Shop", version: "1" },
    tags: [
      { name: "billing" },
      { name: "invoices", parent: "billing" },
      { name: "lines", parent: "invoices" },
      { name: "refunds", parent: "billing" },
    ],
    paths: {
      "/billing/summary": { get: { operationId: "getSummary", tags: ["billing"], responses: ok } },
      "/billing/invoices": {
        get: { operationId: "listInvoices", tags: ["invoices"], responses: ok },
      },
      "/billing/invoices/lines": {
        get: { operationId: "listLines", tags: ["lines"], responses: ok },
      },
      "/billing/refunds": { get: { operationId: "listRefunds", tags: ["refunds"], responses: ok } },
    },
  }),
);

/* Each group kept, with its parent and how many endpoints it keeps. */
function kept(spec: ParsedSpec): string[] {
  return spec.groups.map(
    (group) => `${group.name}<${group.parent ?? ""}:${group.endpoints.length}`,
  );
}

describe("filterSpec", () => {
  it("keeps a parent whose own endpoints are left out while a group inside it keeps one", () => {
    expect(kept(filterSpec(SPEC, { tags: ["invoices"] }, undefined))).toEqual([
      "billing<:0",
      "invoices<billing:1",
    ]);
  });

  it("keeps every group on the way to a deeper one that keeps an endpoint", () => {
    expect(kept(filterSpec(SPEC, { tags: ["lines"] }, undefined))).toEqual([
      "billing<:0",
      "invoices<billing:0",
      "lines<invoices:1",
    ]);
  });

  it("drops a group none of whose groups keeps an endpoint", () => {
    expect(kept(filterSpec(SPEC, { tags: ["refunds"] }, undefined))).toEqual([
      "billing<:0",
      "refunds<billing:1",
    ]);
    expect(
      kept(filterSpec(SPEC, undefined, { tags: ["billing", "invoices", "lines", "refunds"] })),
    ).toEqual([]);
  });

  it("returns the specification as it is without include and exclude", () => {
    expect(filterSpec(SPEC, undefined, undefined)).toBe(SPEC);
  });

  it("is generated with the groups it keeps nested in their parent", () => {
    const files = generateCode(
      filterSpec(SPEC, { tags: ["invoices"] }, undefined),
      { type: "openapi", outputDir: "src/api" },
      "shop",
    );
    const at = (path: string) => files.find((file) => file.path === path)?.content ?? "";

    expect(at("src/api/shop/source.ts")).toContain('import { billing } from "./billing/index";');
    expect(at("src/api/shop/billing/index.ts")).toContain("invoices");
    expect(at("src/api/shop/invoices/index.ts")).toContain("listInvoices");
  });
});
