/**
 * The path the JSON tree copies for a value is code that reaches the value
 * from the root: a key that is no identifier goes in brackets, as a string
 * literal that reads the same wherever the path is put, a page's script
 * among them. The values are made up.
 */
import { describe, expect, it } from "vitest";
import { jsonTreeRows } from "@/features/requests/json-tree";
import { AWKWARD, expectNothingEndsTheCode } from "./awkward-text";

describe("the path a JSON tree copies", () => {
  it("reaches a value under a key that is no identifier, and holds nothing that ends a page's script", () => {
    const list = [{ [AWKWARD]: "found" }];
    const row = jsonTreeRows({ list }, new Set(), new Map()).find((r) => r.kind === "value");
    const accessor = row?.accessor ?? "";

    expect(new Function("list", `return ${accessor};`)(list)).toBe("found");
    expectNothingEndsTheCode(accessor);
  });
});
