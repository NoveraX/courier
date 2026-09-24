import { describe, expect, it } from "vitest";

import { separatorBefore } from "../../../src/server/mocks-edit/plan/separator-before";

describe("separatorBefore", () => {
  it("adds nothing after nothing, whitespace or a BOM", () => {
    expect(["", "\n\n", "\uFEFF"].map((before) => separatorBefore(before, "\n"))).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("adds two line breaks after text without one", () => {
    expect(separatorBefore("const a = 1;", "\r\n")).toBe("\r\n\r\n");
  });

  it("adds one line break after text that ends a line", () => {
    expect(separatorBefore("const a = 1;\r\n", "\r\n")).toBe("\r\n");
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
  ])("counts %s at the end as a line break", (_what, terminator) => {
    expect(separatorBefore(`const a = 1;${terminator}`, "\r")).toBe("\r");
    expect(separatorBefore(`const a = 1;${terminator}${terminator}`, "\r")).toBe("");
  });

  it("counts a CRLF and a lone CR after it as two line breaks", () => {
    expect(separatorBefore("const a = 1;\r\n\r", "\n")).toBe("");
  });

  it("adds nothing after a blank line", () => {
    expect(separatorBefore("const a = 1;\n\n", "\n")).toBe("");
    expect(separatorBefore("const a = 1;\r\n\r\n", "\r\n")).toBe("");
  });
});
