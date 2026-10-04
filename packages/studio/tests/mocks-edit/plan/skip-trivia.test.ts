import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { skipTrivia } from "../../../src/server/mocks-edit/plan/skip-trivia";

describe("skipTrivia", () => {
  it("steps over whitespace, line breaks and comments to the next code", () => {
    const text = "a /* x */\n  // y\n  , b";
    const { commentEnds } = parseSource("x.ts", text);

    expect(skipTrivia(text, 1, commentEnds)).toBe(text.indexOf(","));
  });

  it("stays at code", () => {
    const { commentEnds } = parseSource("x.ts", "a,b");

    expect(skipTrivia("a,b", 1, commentEnds)).toBe(1);
  });

  it("stops at the end of the text", () => {
    const text = "a // x";
    const { commentEnds } = parseSource("x.ts", text);

    expect(skipTrivia(text, 1, commentEnds)).toBe(text.length);
  });
});
