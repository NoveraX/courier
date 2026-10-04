import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { trailingCommaAfter } from "../../../src/server/mocks-edit/plan/trailing-comma-after";

describe("trailingCommaAfter", () => {
  it("finds a comma behind a comment", () => {
    const text = "x = { a: 1 /* c */ , }";
    const { commentEnds } = parseSource("x.ts", text);

    expect(trailingCommaAfter(text, text.indexOf("1") + 1, commentEnds)).toBe(text.indexOf(","));
  });

  it("does not mistake a comma inside a comment for one", () => {
    const text = "x = { a: 1 // a, b\n}";
    const { commentEnds } = parseSource("x.ts", text);

    expect(trailingCommaAfter(text, text.indexOf("1") + 1, commentEnds)).toBeNull();
  });

  it("returns null when the brace follows", () => {
    const text = "x = { a: 1 }";
    const { commentEnds } = parseSource("x.ts", text);

    expect(trailingCommaAfter(text, text.indexOf("1") + 1, commentEnds)).toBeNull();
  });
});
