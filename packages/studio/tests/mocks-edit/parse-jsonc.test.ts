import { describe, expect, it } from "vitest";

import { parseJsonc } from "../../src/server/mocks-edit/parse-jsonc";

describe("parseJsonc", () => {
  it("parses what JSON.parse parses, to the same value", () => {
    const text = JSON.stringify({
      compilerOptions: { module: "NodeNext", strict: true, target: null, lib: ["ES2022", "DOM"] },
      depth: [1, -2.5, 3e3, [{}]],
    });

    expect(parseJsonc(text)).toEqual(JSON.parse(text));
  });

  it("reads past line and block comments, and trailing commas", () => {
    const text = [
      "/* The project's compiler options */",
      "{",
      "  // Node's own resolution",
      '  "compilerOptions": { "module": "NodeNext", /* inline */ "include": ["src/**/*",], },',
      "} // trailing",
    ].join("\n");

    expect(parseJsonc(text)).toEqual({
      compilerOptions: { module: "NodeNext", include: ["src/**/*"] },
    });
  });

  it("keeps comment markers inside strings", () => {
    expect(parseJsonc('{ "url": "https://example.test/*x*/" }')).toEqual({
      url: "https://example.test/*x*/",
    });
  });

  it("reads a leading byte-order mark as whitespace", () => {
    expect(parseJsonc('﻿{ "a": 1 }')).toEqual({ a: 1 });
  });

  it("keeps a __proto__ key as an own property, as JSON.parse does", () => {
    const value = parseJsonc('{ "__proto__": { "polluted": true } }');

    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(value)).toEqual(["__proto__"]);
  });

  it("reads an unquoted key, as TypeScript does", () => {
    expect(parseJsonc("{ module: 'x' }")).toEqual({ module: "x" });
  });

  it.each([
    ["an empty text", ""],
    ["two values", "{} {}"],
    ["a statement after the value", "{}; globalThis.x = 1"],
    ["a closed parenthesis that opens another expression", "{}), ({}"],
    ["an identifier", "{ a: undefined }"],
    ["a call", '{ "a": f() }'],
    ["a template literal", "{ a: `x` }"],
    ["a regular expression", "{ a: /x/ }"],
    ["a spread", "{ ...a }"],
    ["a computed key", '{ ["a"]: 1 }'],
    ["a method", "{ a() {} }"],
    ["a hole in an array", "[1,,2]"],
  ])("refuses %s", (_, text) => {
    expect(() => parseJsonc(text)).toThrow(SyntaxError);
  });
});
