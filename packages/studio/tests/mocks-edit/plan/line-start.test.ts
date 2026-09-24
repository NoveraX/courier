import { describe, expect, it } from "vitest";

import { lineStart } from "../../../src/server/mocks-edit/plan/line-start";

describe("lineStart", () => {
  it("is 0 on the first line", () => {
    expect(lineStart("abc", 2)).toBe(0);
    expect(lineStart("abc", 0)).toBe(0);
  });

  it("is right after the line break before the offset", () => {
    expect(lineStart("a\nbc", 3)).toBe(2);
    expect(lineStart("a\r\nbc", 4)).toBe(3);
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
  ])("counts %s as a line break", (_what, terminator) => {
    expect(lineStart(`a${terminator}bc`, 3)).toBe(2);
  });

  it("puts an offset on a line break on the line the break ends", () => {
    expect(lineStart("ab\ncd", 2)).toBe(0);
  });
});
