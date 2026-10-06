/**
 * Groups inside groups in Studio: the Group filter offers them as a tree —
 * a group choosing everything inside it, a partly chosen one mixed — and
 * the Explorer models them in tree order, each group's figures adding up
 * its whole subtree, its graph giving each level a column of its own and
 * folding a group into one card that the calls to what it hides run to.
 */
import { describe, expect, it } from "vitest";

import { explorerModelOf } from "@/features/explorer/explorer-model";
import { graphLayoutOf } from "@/features/explorer/graph-layout";
import { GRAPH } from "@/features/explorer/graph-types";
import { groupTreeOptions } from "@/features/requests/group-tree-options";
import { selectionState, toggleValues } from "@/features/requests/tree-selection";
import type { Catalog, CatalogEndpoint } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

const NOW = 1_000_000;

function def(path: string): CatalogEndpoint {
  return {
    type: "query",
    hasVariablesSchema: false,
    hasResponseSchema: false,
    path,
    origin: "scan",
  };
}

const CATALOG: Catalog = {
  shop: {
    baseURL: "https://api.example",
    groups: {
      billing: { prefix: "billing", endpoints: { summary: def("summary") } },
      "billing.invoices": { prefix: "billing/invoices", endpoints: { list: def("") } },
      "billing.invoices.lines": {
        prefix: "billing/invoices/:invoice/lines",
        endpoints: { list: def("") },
      },
      users: { prefix: "users", endpoints: { list: def("") } },
    },
  },
};

const OPTIONS = {
  metric: "latency",
  slowMs: 500,
  query: "",
  hover: undefined,
  selected: undefined,
} as const;

describe("the Group filter's tree", () => {
  const flat = [
    { value: "billing.invoices.lines", label: "billing.invoices.lines", count: 2 },
    { value: "users", label: "users", count: 5 },
    { value: "", label: "no group", count: 1 },
    { value: "billing", label: "billing", count: 1 },
  ];

  it("puts each group under the one it sits in, a group seen only through its inner ones added", () => {
    const rows = groupTreeOptions(flat);

    expect(rows.map((r) => [r.value, r.name ?? r.label, r.depth ?? 0, r.count])).toEqual([
      ["", "no group", 0, 1],
      ["users", "users", 0, 5],
      ["billing", "billing", 0, 3],
      ["billing.invoices", "invoices", 1, 2],
      ["billing.invoices.lines", "lines", 2, 2],
    ]);
    expect(rows[2]?.subtree).toEqual(["billing", "billing.invoices", "billing.invoices.lines"]);
  });

  it("chooses a group with everything inside it, and shows a partly chosen one as mixed", () => {
    const subtree = ["billing", "billing.invoices", "billing.invoices.lines"];

    const chosen = toggleValues(["users"], subtree);

    expect(chosen).toEqual(["users", ...subtree]);
    expect(selectionState(["billing.invoices"], subtree)).toBe("mixed");
    expect(toggleValues(chosen, subtree)).toEqual(["users"]);
  });
});

describe("the Explorer of groups inside groups", () => {
  const requests = [
    requestEntry({ id: "a", source: "shop", group: "billing.invoices.lines", method: "list" }),
    requestEntry({ id: "b", source: "shop", group: "billing.invoices", method: "list" }),
  ];
  const model = explorerModelOf(CATALOG, requests, NOW, 500);

  it("lists every group in tree order, each adding up its whole subtree", () => {
    const groups = model.sources[0]?.groups ?? [];

    expect(groups.map((g) => [g.key, g.depth, g.parent])).toEqual([
      ["shop.billing", 0, undefined],
      ["shop.billing.invoices", 1, "shop.billing"],
      ["shop.billing.invoices.lines", 2, "shop.billing.invoices"],
      ["shop.users", 0, undefined],
    ]);
    expect(groups[0]?.metrics.calls).toBe(2);
  });

  it("gives each level of groups a column, and the endpoints the one after the deepest", () => {
    const layout = graphLayoutOf(model, OPTIONS);
    const xOf = (id: string) => layout.nodes.find((n) => n.id === id)?.x;

    expect(xOf("g:shop.billing")).toBe(GRAPH.x.group);
    expect(xOf("g:shop.billing.invoices.lines")).toBe(GRAPH.x.group + 2 * GRAPH.step);
    expect(xOf("e:shop.billing.summary")).toBe(GRAPH.x.group + 3 * GRAPH.step);
    expect(layout.columns.map((c) => c.label)).toEqual([
      "Sources · 1",
      "Groups · 2",
      "Groups inside · 1",
      "Groups inside · 1",
      "Endpoints · 4",
    ]);
  });

  it("runs a call through every group on its way", () => {
    const layout = graphLayoutOf(model, OPTIONS);

    expect(layout.branches.get("shop.billing.invoices.lines.list")?.path.match(/C/g)).toHaveLength(
      4,
    );
  });

  it("folds a group into one card, the calls to what it hides running to that card", () => {
    const layout = graphLayoutOf(model, { ...OPTIONS, folded: new Set(["shop.billing.invoices"]) });
    const ids = layout.nodes.map((n) => n.id);
    const folded = layout.nodes.find((n) => n.id === "g:shop.billing.invoices");

    expect(ids).not.toContain("g:shop.billing.invoices.lines");
    expect(ids).not.toContain("e:shop.billing.invoices.list");
    expect(folded?.fold).toEqual({ folded: true, hidden: 2 });
    expect(folded?.sub).toBe("2 endpoints inside");
    expect(layout.branches.get("shop.billing.invoices.lines.list")?.path.match(/C/g)).toHaveLength(
      2,
    );
  });
});
