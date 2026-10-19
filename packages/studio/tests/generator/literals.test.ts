/**
 * A name taken from a specification is written as a key wherever the code
 * needs one: bare when it is an identifier, quoted otherwise. In an object
 * literal `__proto__` is computed, as written either way it sets the
 * object's prototype and the field is lost; in a type it names a field.
 */
import { describe, expect, it } from "vitest";

import { objectKey, typeKey } from "../../src/apis/generator/literals";

describe("objectKey", () => {
  it("writes an identifier bare, any other name quoted, and __proto__ computed", () => {
    expect(objectKey("id")).toBe("id");
    expect(objectKey("user-id")).toBe('"user-id"');
    expect(objectKey("constructor")).toBe("constructor");
    expect(objectKey("__proto__")).toBe('["__proto__"]');
  });

  it("writes a key an object literal reads as the field it names", () => {
    const literal = new Function(
      `return { ${objectKey("__proto__")}: 1, ${objectKey("a-b")}: 2 };`,
    )();

    expect(Object.keys(literal)).toEqual(["__proto__", "a-b"]);
    expect(Object.getPrototypeOf(literal)).toBe(Object.prototype);
  });
});

describe("typeKey", () => {
  it("writes __proto__ as it is, and other names as objectKey does", () => {
    expect(typeKey("__proto__")).toBe("__proto__");
    expect(typeKey("id")).toBe("id");
    expect(typeKey("user-id")).toBe('"user-id"');
  });
});
