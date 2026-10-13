/**
 * The Courier view's data: the rows under each row, the places the code
 * calls an endpoint asked of Studio once in a while rather than on every
 * redraw, and a Studio that stops answering said so under the endpoint.
 */
import { describe, expect, it } from "vitest";

import { StudioTokenRefusal } from "../src/studio/studio-token-refusal";
import type { CallSite, EndpointStats } from "../src/studio/studio-types";
import { createEndpointTree } from "../src/view/endpoint-tree";
import type { CourierNode } from "../src/view/tree-nodes";

const STUDIO = "http://localhost:6280";
const PLACE: EndpointStats = {
  source: "shop",
  endpoint: "orders.place",
  calls: 2,
  failed: 0,
  pending: 0,
  statuses: {},
};
const SITE: CallSite = {
  file: "src/cart.ts",
  path: "/work/shop/src/cart.ts",
  line: 4,
  column: 9,
  code: "await api.orders.place(cart)",
};
const project = { root: "/work/shop", name: "shop", workspace: "/work" };

function treeWith(fetchSites: () => Promise<CallSite[]>) {
  return createEndpointTree({
    targets: async () => [{ project, studio: STUDIO }],
    statsFor: (studio) => (studio === STUDIO ? [PLACE] : undefined),
    fetchSites,
  });
}

async function childrenOf(tree: ReturnType<typeof treeWith>, node?: CourierNode) {
  return (await tree.getChildren(node)) ?? [];
}

describe("the Courier view's data", () => {
  it("walks from the source down to where the code calls the endpoint", async () => {
    let asked = 0;
    const tree = treeWith(async () => {
      asked += 1;
      return [SITE];
    });
    const [source] = await childrenOf(tree);
    const [orders] = await childrenOf(tree, source);
    const [place] = await childrenOf(tree, orders);
    const sites = await childrenOf(tree, place);
    await childrenOf(tree, place);

    expect([source?.kind, orders?.kind, place?.kind]).toEqual(["source", "group", "endpoint"]);
    expect(sites).toEqual([{ kind: "site", studio: STUDIO, stats: PLACE, site: SITE }]);
    expect(asked).toBe(1);
  });

  it("says Studio did not answer, and asks again next time", async () => {
    let fail = true;
    const tree = treeWith(async () => {
      if (fail) throw new Error("connect ECONNREFUSED");
      return [SITE];
    });
    const place: CourierNode = { kind: "endpoint", studio: STUDIO, stats: PLACE };

    const silent = await childrenOf(tree, place);
    fail = false;

    expect(silent).toMatchObject([{ kind: "note", text: "Courier Studio did not answer" }]);
    expect(await childrenOf(tree, place)).toMatchObject([{ kind: "site", site: SITE }]);
  });

  it("says the call sites need the project's token when Studio refuses them for want of it", async () => {
    const tree = treeWith(async () => {
      throw new StudioTokenRefusal();
    });
    const place: CourierNode = { kind: "endpoint", studio: STUDIO, stats: PLACE };

    expect(await childrenOf(tree, place)).toMatchObject([
      { kind: "note", text: "Courier Studio lists the call sites only with the project's token" },
    ]);
  });
});
