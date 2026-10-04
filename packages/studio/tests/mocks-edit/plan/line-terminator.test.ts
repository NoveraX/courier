import { describe, expect, it } from "vitest";
import { LINE_TERMINATOR } from "../../../src/server/mocks-edit/plan/line-terminator";

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
