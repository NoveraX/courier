import type { ImportDeclaration } from "oxc-parser";
import { describe, expect, it } from "vitest";
import { exportName } from "../../../src/server/mocks-edit/plan/export-name";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function importOf(text: string, fileName = "x.ts"): ImportDeclaration {
  const [statement] = parseSource(fileName, text).program.body;
  if (statement?.type !== "ImportDeclaration") throw new Error("the fixture must be an import");
  return statement;
}

describe("exportName", () => {
  it("reads an identifier or a string name", () => {
    const declaration = importOf(`import { a, "b c" as d } from "m";`);

    expect(
      declaration.specifiers.map((s) =>
        s.type === "ImportSpecifier" ? exportName(s.imported) : null,
      ),
    ).toEqual(["a", "b c"]);
  });
});
