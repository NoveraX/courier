import { describe, expect, it } from "vitest";

import { lineTerminatorLength } from "../../../src/server/mocks-edit/plan/line-terminator-length";

describe("lineTerminatorLength", () => {
  it("reads CRLF as one terminator of two code units", () => {
    expect(lineTerminatorLength("a\r\nb", 1)).toBe(2);
  });

  it("reads LF, a lone CR, U+2028 and U+2029 as terminators of one", () => {
    expect(["\n", "\r", "\u2028", "\u2029"].map((t) => lineTerminatorLength(`a${t}b`, 1))).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("is 0 on anything else, and past the end of the text", () => {
    expect(lineTerminatorLength("a b", 1)).toBe(0);
    expect(lineTerminatorLength("a\u0085b", 1)).toBe(0);
    expect(lineTerminatorLength("a", 1)).toBe(0);
  });

  it("is 0 before the start of the text, even when the text starts with CRLF", () => {
    expect(lineTerminatorLength("\r\na", -1)).toBe(0);
    expect(lineTerminatorLength("\na", -1)).toBe(0);
  });
});
