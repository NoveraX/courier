import { describe, expect, it } from "vitest";

import { lineIndexAt } from "../../src/server/mocks-edit/line-index-at";
import { splitLines } from "../../src/server/mocks-edit/split-lines";

describe("finding the line an offset falls on", () => {
  const lines = splitLines("ab\ncd\n");

  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [5, 1],
    [6, 2],
  ])("puts offset %i on line %i", (offset, index) => {
    expect(lineIndexAt(lines, offset)).toBe(index);
  });

  it("puts the end of a text without a final line break on its last line", () => {
    expect(lineIndexAt(splitLines("ab\ncd"), 5)).toBe(1);
  });

  it("puts every offset of an empty text past its lines", () => {
    expect(lineIndexAt([], 0)).toBe(0);
  });
});
