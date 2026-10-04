import type { ImportDeclaration } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { isValueSpecifier } from "../../../src/server/mocks-edit/plan/is-value-specifier";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function importOf(text: string, fileName = "x.ts"): ImportDeclaration {
  const [statement] = parseSource(fileName, text).program.body;
  if (statement?.type !== "ImportDeclaration") throw new Error("the fixture must be an import");
  return statement;
}

describe("isValueSpecifier", () => {
  it("rejects only a named specifier marked type", () => {
    const declaration = importOf(`import d, { type a, b } from "m";`);

    expect(declaration.specifiers.map(isValueSpecifier)).toEqual([true, false, true]);
  });
});
