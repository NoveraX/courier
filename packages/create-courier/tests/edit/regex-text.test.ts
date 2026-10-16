import { describe, expect, it } from "vitest";

import { namePattern, regexText } from "../../src/edit/regex-text";

describe("regexText", () => {
  it("matches the text alone, whatever characters a pattern gives a meaning", () => {
    for (const text of ["./courier.config", "a+b*c?", "$x^(y)|[z]{1}", "back\\slash/dir"]) {
      const pattern = new RegExp(`^${regexText(text)}$`);

      expect(pattern.test(text)).toBe(true);
      expect(pattern.test(`${text}x`)).toBe(false);
    }
    expect(new RegExp(regexText(".")).test("x")).toBe(false);
  });
});

describe("namePattern", () => {
  it("matches a dotted name with any spaces around its dots, and a dollar as itself", () => {
    expect(new RegExp(`^${namePattern("app.use")}$`).test("app . use")).toBe(true);
    expect(new RegExp(`^${namePattern("app.use")}$`).test("appXuse")).toBe(false);
    expect(new RegExp(`^${namePattern("$router")}$`).test("$router")).toBe(true);
  });
});
