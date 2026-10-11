/**
 * How the Courier view draws its rows: an endpoint in the colours the
 * editor gives test results — failed, answered, not called yet — with its
 * figures and its full hover, and the actions its state allows; a project
 * by whether its Studio runs; a group by its endpoints' tally; a call site
 * opening the file at the call. Every row has an id, so what is open stays
 * open as the figures move.
 */
import { describe, expect, it } from "vitest";
import { studioLink } from "../src/hints/hint-text";
import type { EndpointStats } from "../src/studio/studio-types";
import { groupEndpoints } from "../src/view/endpoint-groups";
import { treeItemOf } from "../src/view/tree-items";
import { MarkdownString, ThemeIcon } from "./vscode-stand-in";

const STUDIO = "http://localhost:6280";
const NOW = 1_700_000_000_000;
const stats = (overrides: Partial<EndpointStats>): EndpointStats => ({
  source: "shop",
  endpoint: "orders.place",
  calls: 34,
  failed: 0,
  pending: 0,
  statuses: {},
  p95: 210,
  ...overrides,
});
const endpointItem = (overrides: Partial<EndpointStats>) =>
  treeItemOf({ kind: "endpoint", studio: STUDIO, stats: stats(overrides) }, NOW);

describe("the Courier view's rows, drawn", () => {
  it("draws a failed endpoint red, with its figures, its hover and its failure's actions", () => {
    const lastFailure = { at: NOW - 5000, status: 500, message: "boom", request: "req_1" };
    const item = endpointItem({ failed: 1, lastFailure });

    expect(item.label).toBe("place");
    expect(item.id).toBe(`endpoint:${STUDIO}:shop.orders.place`);
    expect(item.description).toBe("34 calls · 1 failed · p95 210 ms");
    expect(item.iconPath).toEqual(new ThemeIcon("error", { id: "testing.iconFailed" }));
    expect(item.contextValue).toBe("courier.endpoint.failed.latest");
    expect(item.tooltip).toBeInstanceOf(MarkdownString);
    expect((item.tooltip as MarkdownString).value).toContain(
      studioLink(`${STUDIO}/timeline?req=req_1`),
    );
  });

  it("draws an answered endpoint green, and one not called yet as not run", () => {
    expect(endpointItem({}).iconPath).toEqual(new ThemeIcon("pass", { id: "testing.iconPassed" }));
    expect(endpointItem({}).contextValue).toBe("courier.endpoint");

    const idle = endpointItem({ calls: 0, p95: undefined });
    expect(idle.iconPath).toEqual(new ThemeIcon("circle-outline", { id: "testing.iconUnset" }));
    expect(idle.description).toBe("no calls yet");
  });

  it("names a project's Studio by its host, or says it is not running", () => {
    const project = { root: "/work/shop", name: "shop", workspace: "/work" };
    const running = treeItemOf({ kind: "project", project, studio: STUDIO }, NOW);
    const stopped = treeItemOf({ kind: "project", project }, NOW);

    expect([running.description, running.contextValue]).toEqual([
      "localhost:6280",
      "courier.project.running",
    ]);
    expect([stopped.description, stopped.contextValue]).toEqual([
      "Studio not running",
      "courier.project.stopped",
    ]);
  });

  it("tallies a group's endpoints, inner groups included", () => {
    const group = groupEndpoints([
      stats({ endpoint: "orders.place", failed: 2 }),
      stats({ endpoint: "orders.refunds.create" }),
    ]).groups[0];
    if (!group) throw new Error("expected the orders group");

    const item = treeItemOf({ kind: "group", studio: STUDIO, source: "shop", group }, NOW);

    expect([item.label, item.description]).toEqual(["orders", "2 endpoints · 1 failing"]);
  });

  it("opens a call site's file at the call", () => {
    const site = {
      file: "src/cart.ts",
      path: "/work/shop/src/cart.ts",
      line: 4,
      column: 9,
      code: "x",
    };
    const item = treeItemOf({ kind: "site", studio: STUDIO, stats: stats({}), site }, NOW);

    expect([item.label, item.description]).toEqual(["cart.ts:4", "x"]);
    expect(item.command?.command).toBe("vscode.open");
    expect(String(item.command?.arguments?.[0])).toBe("file:///work/shop/src/cart.ts");
    expect(String(item.resourceUri)).toBe("file:///work/shop/src/cart.ts#L4");
    expect(item.command?.arguments?.[1]).toMatchObject({
      selection: { start: { line: 3, character: 8 } },
    });
  });
});
