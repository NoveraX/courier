import { describe, expect, it } from "vitest";

import {
  countLineTerminators,
  LINE_TERMINATOR,
  lineTerminatorLength,
} from "../../../src/server/mocks-edit/plan/line-terminator";

describe("LINE_TERMINATOR", () => {
  it("splits at every terminator, CRLF as one", () => {
    expect("a\r\nb\nc\rd\u2028e\u2029f".split(LINE_TERMINATOR)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("does not split at NEL, which ends no line of ECMAScript", () => {
    expect("a\u0085b".split(LINE_TERMINATOR)).toEqual(["a\u0085b"]);
  });
});

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

describe("countLineTerminators", () => {
  it("counts each kind once, CRLF included", () => {
    expect(countLineTerminators("a\r\n\nb\rc\u2028d\u2029", 0, 10)).toBe(5);
  });

  it("counts only within the range", () => {
    expect(countLineTerminators("a\n\nb\n", 1, 3)).toBe(2);
    expect(countLineTerminators("a\n\nb\n", 3, 4)).toBe(0);
  });
});
