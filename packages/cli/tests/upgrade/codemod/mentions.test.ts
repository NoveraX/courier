import { describe, expect, it } from "vitest";

import { mentions } from "../../../src/upgrade/codemod/mentions";

describe("mentions", () => {
  it("finds a word written as it is, and no word the text does not write", () => {
    expect(mentions('import { isHTTPError } from "@noverax/courier";', ["isHTTPError"])).toBe(true);
    expect(mentions('import { endpoint } from "@noverax/courier";', ["isHTTPError"])).toBe(false);
    expect(mentions("const x = 1;", [])).toBe(false);
  });

  it.each([
    ["an identifier's \\u escape", "import { is\\u0048TTPError } from 'x';"],
    ["an identifier's \\u{} escape", "import { \\u{69}sHTTPError } from 'x';"],
    ["a string's \\x escape", "import { '\\x69sHTTPError' as check } from 'x';"],
    ["a string's octal escape", "import { '\\151sHTTPError' as check } from 'x';"],
    ["a string's escape of a plain character", "import { 'is\\HTTPError' as check } from 'x';"],
    ["a string's line continued", "import { 'isHTTP\\\nError' as check } from 'x';"],
    [
      "a line continued after a carriage return",
      "import { 'isHTTP\\\r\nError' as check } from 'x';",
    ],
  ])("finds a word spelled with %s", (_, text) => {
    expect(mentions(text, ["isHTTPError"])).toBe(true);
  });

  it("reads an escape past the last code point as spelling nothing", () => {
    expect(mentions("const x = '\\u{110000}';", ["isHTTPError"])).toBe(false);
  });

  it("finds no word where an escaped backslash leaves what follows it plain", () => {
    expect(mentions("const x = '\\\\u0069sHTTPError';", ["isHTTPError"])).toBe(false);
  });
});
