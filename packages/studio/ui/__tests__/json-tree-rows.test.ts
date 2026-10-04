/**
 * A JSON value as the lines of the inspector's tree: containers opening and
 * closing, the closed ones summed up, values coloured by kind, and the
 * validation issue at a value marked — paths named the way validation
 * issues name them.
 */
import { describe, expect, it } from "vitest";

import { containerPaths, jsonTreeRows, valueAtPath } from "@/features/requests/json-tree";

const VALUE = { hits: [{ price: 189 }, { price: "64.00" }], took: 41, done: true, next: null };

describe("a JSON tree", () => {
  it("opens and closes every container, each value under its key and path", () => {
    const rows = jsonTreeRows({ a: [1, "x"] }, new Set(), new Map());

    expect(rows.map((r) => [r.kind, r.path, r.key?.text ?? null, r.text, r.depth])).toEqual([
      ["open", "", null, "{", 0],
      ["open", "a", "a", "[", 1],
      ["value", "a.0", "0", "1", 2],
      ["value", "a.1", "1", '"x"', 2],
      ["close", "a", null, "]", 1],
      ["close", "", null, "}", 0],
    ]);
    expect(rows[2]?.key).toEqual({ text: "0", index: true });
  });

  it("colours a value by its kind, and sums up a container", () => {
    const rows = jsonTreeRows(VALUE, new Set(), new Map());
    const at = (path: string) => rows.find((r) => r.path === path && r.kind !== "close");

    expect(at("took")?.tone).toBe("number");
    expect(at("hits.1.price")?.tone).toBe("string");
    expect(at("done")?.tone).toBe("literal");
    expect(at("next")?.text).toBe("null");
    expect(at("hits")?.summary).toBe("2 items");
    expect(at("")?.summary).toBe("4 keys");
  });

  it("hides a closed container's contents", () => {
    const rows = jsonTreeRows(VALUE, new Set(["hits"]), new Map());
    const hits = rows.find((r) => r.path === "hits");

    expect(hits).toMatchObject({ kind: "open", collapsed: true, text: "[…]" });
    expect(rows.some((r) => r.path.startsWith("hits."))).toBe(false);
  });

  it("marks the issue at a value", () => {
    const rows = jsonTreeRows(VALUE, new Set(), new Map([["hits.1.price", "Expected number"]]));

    expect(rows.find((r) => r.path === "hits.1.price")?.issue).toBe("Expected number");
    expect(rows.filter((r) => r.issue !== undefined)).toHaveLength(1);
  });

  it("knows every container's path, to close them all", () => {
    expect(containerPaths(VALUE)).toEqual(["", "hits", "hits.0", "hits.1"]);
    expect(containerPaths(4)).toEqual([]);
  });
});

describe("the value at a path", () => {
  it("is found through keys and indices, a null among them", () => {
    expect(valueAtPath(VALUE, "hits.1.price")).toEqual({ found: true, value: "64.00" });
    expect(valueAtPath(VALUE, "next")).toEqual({ found: true, value: null });
    expect(valueAtPath(VALUE, "")).toEqual({ found: true, value: VALUE });
  });

  it("is not found past a value, or under a key that is not there", () => {
    expect(valueAtPath(VALUE, "took.x")).toEqual({ found: false, value: undefined });
    expect(valueAtPath(VALUE, "hits.5")).toEqual({ found: false, value: undefined });
    expect(valueAtPath(VALUE, "missing")).toEqual({ found: false, value: undefined });
  });
});
