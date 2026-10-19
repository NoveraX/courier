/**
 * The one stretch of a text an edit changed, so the editor can type just
 * that stretch through the browser.
 */
import { describe, expect, it } from "vitest";

import { replacedRange } from "@/features/playground/replaced-range";

const apply = (before: string, { from, to, insert }: ReturnType<typeof replacedRange>) =>
  before.slice(0, from) + insert + before.slice(to);

describe("replacedRange", () => {
  it("finds an insertion between what the two texts share", () => {
    expect(replacedRange('{\n"a": 1\n}', '{\n  "a": 1\n}')).toEqual({
      from: 2,
      to: 2,
      insert: "  ",
    });
  });

  it("finds a removal, with nothing to put in its place", () => {
    expect(replacedRange("// a", "a")).toEqual({ from: 0, to: 3, insert: "" });
  });

  it("finds a replacement in the middle", () => {
    expect(replacedRange("abcd", "aXYd")).toEqual({ from: 1, to: 3, insert: "XY" });
  });

  it("never lets what the texts share at both ends overlap", () => {
    expect(replacedRange("aa", "aaa")).toEqual({ from: 2, to: 2, insert: "a" });
    expect(replacedRange("aaa", "aa")).toEqual({ from: 2, to: 3, insert: "" });
  });

  it("gives back the new text when typed over the old one", () => {
    const pairs = [
      ["", "x"],
      ["x", ""],
      ['{\n  "a": 1,\n  "b": 2\n}', '{\n  // "a": 1,\n  // "b": 2\n}'],
      ["  ", "    "],
      ["same", "same"],
    ] as const;

    for (const [before, after] of pairs) {
      expect(apply(before, replacedRange(before, after))).toBe(after);
    }
  });
});
