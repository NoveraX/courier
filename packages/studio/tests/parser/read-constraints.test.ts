/**
 * What a schema allows beyond its type, read from its validation keywords:
 * only the keywords of its own type, only values that mean something, both
 * spellings of an exclusive bound, whole divisors only, and a pattern as
 * JavaScript compiles it.
 */
import { describe, expect, it } from "vitest";

import { readConstraints } from "../../src/apis/parser/read-constraints";

describe("readConstraints", () => {
  it("reads a string's lengths and pattern", () => {
    expect(
      readConstraints(
        { type: "string", minLength: 1, maxLength: 5000, pattern: "^cus_" },
        "string",
      ),
    ).toEqual({ minLength: 1, maxLength: 5000, pattern: { source: "^cus_", unicode: true } });
  });

  it("reads a number's bounds and divisor, and a whole number as one", () => {
    expect(readConstraints({ minimum: 1, maximum: 100, multipleOf: 5 }, "integer")).toEqual({
      integer: true,
      minimum: 1,
      maximum: 100,
      multipleOf: 5,
    });
    expect(readConstraints({ minimum: 0.5 }, "number")).toEqual({ minimum: 0.5 });
  });

  it("reads a list's item counts", () => {
    expect(readConstraints({ minItems: 1, maxItems: 10 }, "array")).toEqual({
      minItems: 1,
      maxItems: 10,
    });
  });

  it("reads an exclusive bound written as OpenAPI 3.0 writes it, beside the bound", () => {
    expect(
      readConstraints(
        { minimum: 0, exclusiveMinimum: true, maximum: 10, exclusiveMaximum: true },
        "number",
      ),
    ).toEqual({ exclusiveMinimum: 0, exclusiveMaximum: 10 });
    expect(readConstraints({ minimum: 0, exclusiveMinimum: false }, "number")).toEqual({
      minimum: 0,
    });
  });

  it("reads an exclusive bound written as OpenAPI 3.1 writes it, as the bound itself", () => {
    expect(readConstraints({ exclusiveMinimum: 0, exclusiveMaximum: 10 }, "number")).toEqual({
      exclusiveMinimum: 0,
      exclusiveMaximum: 10,
    });
  });

  it("reads only the keywords of the schema's own type", () => {
    expect(readConstraints({ maxLength: 5, minimum: 1, maxItems: 2 }, "string")).toEqual({
      maxLength: 5,
    });
    expect(readConstraints({ maxLength: 5, minimum: 1, maxItems: 2 }, "array")).toEqual({
      maxItems: 2,
    });
    expect(readConstraints({ maxLength: 5 }, "boolean")).toBeUndefined();
    expect(readConstraints({ maxLength: 5 }, undefined)).toBeUndefined();
  });

  it("leaves out values that mean nothing", () => {
    expect(
      readConstraints({ minLength: -1, maxLength: 2.5, pattern: "" }, "string"),
    ).toBeUndefined();
    expect(readConstraints({ minimum: "1", maximum: Number.NaN }, "number")).toBeUndefined();
    expect(readConstraints({ minItems: "3" }, "array")).toBeUndefined();
  });

  it("keeps a whole divisor only: a fraction cannot be checked exactly", () => {
    expect(readConstraints({ multipleOf: 0.01 }, "number")).toBeUndefined();
    expect(readConstraints({ multipleOf: 0 }, "integer")).toEqual({ integer: true });
  });

  it("compiles a pattern without the u flag when only that compiles", () => {
    /* `\-` outside a class is an error in Unicode mode only. */
    expect(readConstraints({ pattern: "^a\\-b$" }, "string")).toEqual({
      pattern: { source: "^a\\-b$", unicode: false },
    });
  });

  it("leaves out a pattern JavaScript cannot compile at all", () => {
    expect(readConstraints({ pattern: "(?<=a" }, "string")).toBeUndefined();
    expect(readConstraints({ pattern: "[a-", maxLength: 3 }, "string")).toEqual({ maxLength: 3 });
  });

  it("reads nothing from a schema that constrains nothing", () => {
    expect(readConstraints({ type: "string" }, "string")).toBeUndefined();
    expect(readConstraints({}, "number")).toBeUndefined();
  });
});
