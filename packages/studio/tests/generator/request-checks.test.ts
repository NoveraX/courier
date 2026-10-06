/**
 * The checks a request makes of a value, written for each validation
 * library: as text, and run by the library itself.
 */
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { arkExpressionOf, withArkChecks } from "../../src/apis/generator/arktype-checks";
import { patternLiteral } from "../../src/apis/generator/pattern-literal";
import { withValibotChecks } from "../../src/apis/generator/valibot-checks";
import { withZodChecks } from "../../src/apis/generator/zod-checks";
import type { SchemaConstraints } from "../../src/apis/parser/types";

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown } | Promise<unknown> };
}

/** Evaluate generated source with the libraries in scope. */
function evaluate(source: string): StandardSchema {
  return new Function("z", "v", "type", `return ${source};`)(z, v, type);
}

function accepts(schema: StandardSchema, value: unknown): boolean {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected a synchronous validator");
  return result.issues === undefined;
}

const STRING: SchemaConstraints = {
  minLength: 2,
  maxLength: 4,
  pattern: { source: "^a", unicode: true },
};
const INTEGER: SchemaConstraints = {
  integer: true,
  minimum: 2,
  maximum: 10,
  exclusiveMaximum: 9,
  multipleOf: 2,
};
const LIST: SchemaConstraints = { minItems: 1, maxItems: 2 };

const LIBRARIES = [
  {
    name: "zod",
    string: withZodChecks("z.string()", STRING),
    integer: withZodChecks("z.number()", INTEGER),
    list: withZodChecks("z.array(z.string())", LIST),
  },
  {
    name: "valibot",
    string: withValibotChecks("v.string()", STRING),
    integer: withValibotChecks("v.number()", INTEGER),
    list: withValibotChecks("v.array(v.string())", LIST),
  },
  {
    name: "arktype",
    string: withArkChecks('type("string")', STRING),
    integer: withArkChecks(`type("${arkExpressionOf("number", INTEGER)}")`, INTEGER),
    list: withArkChecks('type("string").array()', LIST),
  },
];

describe.each(LIBRARIES)("checks written for $name", (library) => {
  it("refuse a string outside its lengths or its pattern", () => {
    const schema = evaluate(library.string);

    expect(["ab", "abcd"].map((value) => accepts(schema, value))).toEqual([true, true]);
    expect(["a", "abcde", "bb"].map((value) => accepts(schema, value))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("refuse a number that is not whole, out of bounds, or not a multiple", () => {
    const schema = evaluate(library.integer);

    expect([2, 4, 8].map((value) => accepts(schema, value))).toEqual([true, true, true]);
    expect([0, 3, 4.5, 10, 12].map((value) => accepts(schema, value))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("refuse a list with too few or too many items", () => {
    const schema = evaluate(library.list);

    expect(accepts(schema, ["a"])).toBe(true);
    expect(accepts(schema, [])).toBe(false);
    expect(accepts(schema, ["a", "b", "c"])).toBe(false);
  });
});

describe("checks written as text", () => {
  it("leave a schema without constraints as it was", () => {
    expect(withZodChecks("z.string()", undefined)).toBe("z.string()");
    expect(withValibotChecks("v.string()", {})).toBe("v.string()");
    expect(withArkChecks('type("string")', undefined)).toBe('type("string")');
  });

  it("chain each check in zod, pipe them in valibot, and chain them in ArkType", () => {
    expect(withZodChecks("z.string()", { maxLength: 5000 })).toBe("z.string().max(5000)");
    expect(withValibotChecks("v.number()", { integer: true, minimum: 1 })).toBe(
      "v.pipe(v.number(), v.integer(), v.minValue(1))",
    );
    expect(withArkChecks('type("string")', { minLength: 1 })).toBe(
      'type("string").atLeastLength(1)',
    );
  });

  it("name a whole number in ArkType as number.integer", () => {
    expect(arkExpressionOf("number", { integer: true })).toBe("number.integer");
    expect(arkExpressionOf("number", { minimum: 1 })).toBe("number");
  });

  it("write a pattern as a literal, with the u flag only when it compiled with it", () => {
    expect(patternLiteral({ source: "^a\\d$", unicode: true })).toBe("/^a\\d$/u");
    expect(patternLiteral({ source: "^a\\-b$", unicode: false })).toBe("/^a\\-b$/");
  });

  it("escape what would end or break the literal, and keep every escape the pattern has", () => {
    expect(patternLiteral({ source: "^a/b$", unicode: false })).toBe("/^a\\/b$/");
    expect(patternLiteral({ source: "^a\\/b$", unicode: false })).toBe("/^a\\/b$/");
    expect(patternLiteral({ source: "[/]+/", unicode: true })).toBe("/[/]+\\//u");
    expect(patternLiteral({ source: "a\nb", unicode: false })).toBe("/a\\nb/");
    expect(patternLiteral({ source: "^\\\\$", unicode: false })).toBe("/^\\\\$/");
  });

  it("write a literal that matches exactly as the pattern compiled from its string does", () => {
    const sources = [
      ["^https?://[^/]+/v1/$", true],
      ["^[a-z0-9_/-]{1,40}$", true],
      ["^\\p{L}+/\\p{N}*$", true],
      ["a\u2028b", false],
      ["^(?:[0-9]{3}/){2}\\d$", false],
      ["^[^\\\\/]+\\/?$", true],
    ] as const;
    for (const [source, unicode] of sources) {
      const literal = patternLiteral({ source, unicode });
      const built = new RegExp(source, unicode ? "u" : "");
      const written = new Function(`return ${literal};`)() as RegExp;
      expect(written.source).toBe(built.source);
      expect(written.flags).toBe(built.flags);
    }
  });
});
