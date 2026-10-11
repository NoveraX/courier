/**
 * The rows of the Courier view: nothing while no Studio answers, a single
 * Studio's sources at the top, one row per project of a monorepo; under a
 * source its groups before its own endpoints; under an endpoint the places
 * the code calls it, or a line saying there are none.
 */
import { describe, expect, it } from "vitest";

import type { EndpointStats } from "../src/studio/studio-types";
import {
  type CourierNode,
  groupChildren,
  rootNodes,
  siteNodes,
  sourceNodes,
} from "../src/view/tree-nodes";

const STUDIO = "http://localhost:6280";
const stat = (source: string, endpoint: string, failed = 0): EndpointStats => ({
  source,
  endpoint,
  calls: 3,
  failed,
  pending: 0,
  statuses: {},
});
const PLACE = stat("shop", "orders.place", 1);
const STATS = [
  PLACE,
  stat("shop", "health"),
  stat("payments", "charges.create"),
  stat("shop", "orders.list"),
];
const shop = { root: "/work/shop", name: "shop", workspace: "/work" };
const admin = { root: "/work/admin", name: "admin", workspace: "/work" };
const statsFor = (studio: string) => (studio === STUDIO ? STATS : undefined);
const labelOf = (node: CourierNode) =>
  node.kind === "endpoint"
    ? node.stats.endpoint
    : node.kind === "group"
      ? node.group.path
      : node.kind;

describe("the Courier view's rows", () => {
  it("shows nothing while no Studio answers, so the view offers to start one", () => {
    expect(rootNodes([{ project: shop }], statsFor)).toEqual([]);
    expect(rootNodes([], statsFor)).toEqual([]);
  });

  it("puts a single Studio's sources at the top, in the order Studio lists their endpoints", () => {
    const nodes = rootNodes([{ project: shop, studio: STUDIO }], statsFor);

    expect(nodes.map((node) => (node.kind === "source" ? node.source : node.kind))).toEqual([
      "shop",
      "payments",
    ]);
  });

  it("shows the settings' Studio alone, with no project of the workspace", () => {
    expect(rootNodes([{ studio: STUDIO }], statsFor)).toHaveLength(2);
  });

  it("gives each project of a monorepo a row, running or not", () => {
    const nodes = rootNodes([{ project: shop, studio: STUDIO }, { project: admin }], statsFor);

    expect(nodes).toEqual([
      { kind: "project", project: shop, studio: STUDIO },
      { kind: "project", project: admin, studio: undefined },
    ]);
  });

  it("lists a source's groups before its own endpoints", () => {
    const [source] = sourceNodes(STUDIO, STATS);
    if (source?.kind !== "source") throw new Error("expected the shop's source");

    expect(groupChildren(source).map(labelOf)).toEqual(["orders", "health"]);
    const [orders] = groupChildren(source);
    if (orders?.kind !== "group") throw new Error("expected the orders group");
    expect(groupChildren(orders).map(labelOf)).toEqual(["orders.place", "orders.list"]);
  });

  it("lists where the code calls an endpoint, or says it calls it nowhere", () => {
    const endpoint = { kind: "endpoint", studio: STUDIO, stats: PLACE } as const;
    const site = {
      file: "src/cart.ts",
      path: "/work/shop/src/cart.ts",
      line: 4,
      column: 9,
      code: "x",
    };

    expect(siteNodes(endpoint, [site])).toEqual([{ ...endpoint, kind: "site", site }]);
    expect(siteNodes(endpoint, [])).toEqual([
      {
        kind: "note",
        id: `note:${STUDIO}:shop.orders.place`,
        text: "No call to it in the project's code",
      },
    ]);
  });
});
