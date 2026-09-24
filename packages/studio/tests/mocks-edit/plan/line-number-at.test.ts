import { describe, expect, it } from "vitest";

import { lineNumberAt } from "../../../src/server/mocks-edit/plan/line-number-at";

describe("lineNumberAt", () => {
  it("counts the line breaks before the offset", () => {
    expect(lineNumberAt("a\nb\r\nc", 0)).toBe(1);
    expect(lineNumberAt("a\nb\r\nc", 2)).toBe(2);
    expect(lineNumberAt("a\nb\r\nc", 5)).toBe(3);
  });

  it("puts an offset on a line break on the line it ends", () => {
    expect(lineNumberAt("a\nb", 1)).toBe(1);
    expect(lineNumberAt("a\r\nb", 1)).toBe(1);
    expect(lineNumberAt("a\r\nb", 2)).toBe(1);
  });

  it("counts a lone CR, U+2028 and U+2029 as line breaks", () => {
    expect(lineNumberAt("a\rb\u2028c\u2029d", 6)).toBe(4);
  });
});
