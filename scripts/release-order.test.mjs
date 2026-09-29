/**
 * The publish order decides whether a half-finished release leaves an
 * installable registry behind, so it is pinned here rather than trusted.
 */
import { describe, expect, it } from "vitest";

import {
  dependencyGraph,
  orderByDependency,
  packageDirs,
  publishOrder,
  readPkg,
} from "./release-order.ts";

describe("orderByDependency", () => {
  it("puts a dependency before the package that needs it", () => {
    const order = orderByDependency(
      new Map([
        ["b", ["a"]],
        ["a", []],
      ]),
    );

    expect(order).toEqual(["a", "b"]);
  });

  it("orders a chain end to end", () => {
    const order = orderByDependency(
      new Map([
        ["c", ["b"]],
        ["b", ["a"]],
        ["a", []],
      ]),
    );

    expect(order).toEqual(["a", "b", "c"]);
  });

  /** Two runs from the same commit must publish in the same order. */
  it("breaks ties by name, not by insertion order", () => {
    const one = orderByDependency(
      new Map([
        ["z", []],
        ["a", []],
        ["m", []],
      ]),
    );
    const two = orderByDependency(
      new Map([
        ["m", []],
        ["z", []],
        ["a", []],
      ]),
    );

    expect(one).toEqual(["a", "m", "z"]);
    expect(two).toEqual(one);
  });

  it("refuses a cycle instead of emitting an arbitrary order", () => {
    expect(() =>
      orderByDependency(
        new Map([
          ["a", ["b"]],
          ["b", ["a"]],
        ]),
      ),
    ).toThrow(/cycle among: a, b/);
  });

  it("names every package caught in the cycle", () => {
    expect(() =>
      orderByDependency(
        new Map([
          ["a", ["b"]],
          ["b", ["c"]],
          ["c", ["a"]],
          ["ok", []],
        ]),
      ),
    ).toThrow(/a, b, c/);
  });

  it("ignores an edge pointing outside the set", () => {
    expect(orderByDependency(new Map([["a", ["external"]]]))).toEqual(["a"]);
  });

  it("has nothing to do with an empty workspace", () => {
    expect(orderByDependency(new Map())).toEqual([]);
  });
});

describe("the real workspace", () => {
  const dirs = packageDirs();

  it("publishes every publishable package exactly once", () => {
    const ordered = publishOrder(dirs);

    expect(ordered).toHaveLength(dirs.length);
    expect(new Set(ordered).size).toBe(dirs.length);
  });

  it("leaves no package ahead of something it depends on", () => {
    const ordered = publishOrder(dirs).map((dir) => readPkg(dir).name);
    const graph = dependencyGraph(dirs);

    for (const [name, needs] of graph) {
      for (const dep of needs) {
        expect(ordered.indexOf(dep), `${dep} must precede ${name}`).toBeLessThan(
          ordered.indexOf(name),
        );
      }
    }
  });

  /** The case the old comparator got wrong: both sides have internal deps. */
  it("publishes courier-studio-core before courier-studio", () => {
    const ordered = publishOrder(dirs).map((dir) => readPkg(dir).name);

    expect(ordered.indexOf("@noverax/courier-studio-core")).toBeLessThan(
      ordered.indexOf("@noverax/courier-studio"),
    );
  });

  /* Core is a peer of every adapter, not a dependency. A consumer still has
     to be able to resolve the version the adapter asks for. */
  it("treats a peer on a workspace package as an ordering edge", () => {
    const graph = dependencyGraph(dirs);

    expect(graph.get("@noverax/courier-next")).toContain("@noverax/courier");
    expect(graph.get("@noverax/courier")).toEqual([]);
  });

  it("publishes the core package first", () => {
    expect(readPkg(publishOrder(dirs)[0]).name).toBe("@noverax/courier");
  });

  /** A private workspace package is not a release artefact. */
  it("leaves the private Studio UI package out", () => {
    expect(publishOrder(dirs).map((dir) => readPkg(dir).name)).not.toContain(
      "@noverax/courier-studio-ui",
    );
  });
});
