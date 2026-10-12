/**
 * A value as a regular expression matches it literally.
 */
import { describe, expect, it } from "vitest";

import { escapeForRegex } from "../../src/apis/escape-for-regex";

describe("escapeForRegex", () => {
  it("matches every character a pattern reads as syntax as itself", () => {
    const value = "$.a*b+c?d^e{1}(f)|g[h]\\i";

    expect(new RegExp(`^${escapeForRegex(value)}$`).test(value)).toBe(true);
    expect(new RegExp(`^${escapeForRegex(value)}$`).test("$xa*b+c?d^e{1}(f)|g[h]\\i")).toBe(false);
  });

  it("leaves a plain name as it is", () => {
    expect(escapeForRegex("orders_2")).toBe("orders_2");
  });

  it("escapes the dollar sign a name may hold", () => {
    expect(escapeForRegex("$api")).toBe("\\$api");
    expect(new RegExp(`(?<![\\w$])${escapeForRegex("$api")}(?![\\w$])`).test("use($api)")).toBe(
      true,
    );
  });
});
