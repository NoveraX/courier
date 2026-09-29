import type { ImportDeclaration } from "oxc-parser";
import { describe, expect, it } from "vitest";
import {
  isValueImport,
  isValueSpecifier,
} from "../../../src/server/mocks-edit/plan/is-value-import";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function importOf(text: string, fileName = "x.ts"): ImportDeclaration {
  const [statement] = parseSource(fileName, text).program.body;
  if (statement?.type !== "ImportDeclaration") throw new Error("the fixture must be an import");
  return statement;
}

describe("isValueImport", () => {
  it("accepts a value import in TypeScript and any import in JavaScript", () => {
    expect(isValueImport(importOf(`import { a } from "m";`))).toBe(true);
    expect(isValueImport(importOf(`import { a } from "m";`, "x.mjs"))).toBe(true);
  });

  it("rejects import type and a deferred import", () => {
    expect(isValueImport(importOf(`import type { a } from "m";`))).toBe(false);
    expect(isValueImport(importOf(`import defer * as a from "m";`))).toBe(false);
  });
});

describe("isValueSpecifier", () => {
  it("rejects only a named specifier marked type", () => {
    const declaration = importOf(`import d, { type a, b } from "m";`);

    expect(declaration.specifiers.map(isValueSpecifier)).toEqual([true, false, true]);
  });
});
