import { describe, expect, it } from "vitest";

import { detectIndent } from "../../../src/server/mocks-edit/plan/detect-indent";

describe("detectIndent", () => {
  it("finds a four-space unit", () => {
    expect(detectIndent("a({\n    b: {\n        c,\n    },\n});\n")).toBe("    ");
  });

  it("finds a tab unit", () => {
    expect(detectIndent("a({\n\tb: {\n\t\tc,\n\t},\n});\n")).toBe("\t");
  });

  it("takes the most frequent step when steps differ", () => {
    expect(detectIndent("a\n  b\nc\n  d\ne\n    f\n")).toBe("  ");
  });

  it("does not count JSDoc's one-space continuation", () => {
    expect(detectIndent("/**\n * a\n * b\n */\nx({\n    y,\n});\n")).toBe("    ");
  });

  it("skips blank lines between an indented line and its parent", () => {
    expect(detectIndent("a({\n\n   \n    b,\n});\n")).toBe("    ");
  });

  it("does not count a step of more than eight spaces", () => {
    expect(detectIndent("a\n          b\n")).toBe("  ");
  });

  it("reads CRLF line breaks", () => {
    expect(detectIndent("a({\r\n    b,\r\n});\r\n")).toBe("    ");
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
  ])("reads %s as a line break", (_what, terminator) => {
    expect(detectIndent(`a({${terminator}    b,${terminator}});${terminator}`)).toBe("    ");
  });

  it("defaults to two spaces for a flat file", () => {
    expect(detectIndent("const a = 1;\nconst b = 2;\n")).toBe("  ");
  });
});
