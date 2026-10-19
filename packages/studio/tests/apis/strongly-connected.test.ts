/**
 * The sets of nodes that reach each other, each after every set it reaches,
 * walked without the call stack, so a chain of any length is walked once.
 */
import { describe, expect, it } from "vitest";

import { stronglyConnected } from "../../src/apis/strongly-connected";

const graph = (edges: Record<string, string[]>) => (node: string) => edges[node] ?? [];

describe("stronglyConnected", () => {
  it("groups the nodes that reach each other, each set after the sets it reaches", () => {
    const sets = stronglyConnected(
      ["a", "b", "c", "d", "e"],
      graph({ a: ["b"], b: ["c", "a"], c: ["d"], d: ["c"], e: ["e"] }),
    );

    expect(sets).toEqual([["c", "d"], ["a", "b"], ["e"]]);
  });

  it("passes over a target that is not one of the nodes", () => {
    expect(stronglyConnected(["a"], graph({ a: ["missing", "a"] }))).toEqual([["a"]]);
  });

  it("walks a chain of 200 000 nodes, and a loop of as many, without running out of stack", () => {
    const count = 200_000;
    const nodes = Array.from({ length: count }, (_, at) => `n${at}`);
    const chain = stronglyConnected(nodes, (node) => {
      const at = Number(node.slice(1));
      return at + 1 < count ? [`n${at + 1}`] : [];
    });
    const loop = stronglyConnected(nodes, (node) => [`n${(Number(node.slice(1)) + 1) % count}`]);

    expect(chain).toHaveLength(count);
    expect(chain[0]).toEqual([`n${count - 1}`]);
    expect(loop).toHaveLength(1);
    expect(loop[0]).toHaveLength(count);
  });
});
