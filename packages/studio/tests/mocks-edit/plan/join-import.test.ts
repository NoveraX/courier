import { describe, expect, it } from "vitest";
import { applyEdits } from "../../../src/server/mocks-edit/plan/apply-edits";
import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import { planImportJoin } from "../../../src/server/mocks-edit/plan/join-import";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function joined(text: string, names: string[] = ["defineMockServer"]): string {
  const parsed = parseSource("x.ts", text);
  const [declaration] = parsed.program.body;
  if (declaration?.type !== "ImportDeclaration")
    throw new Error("the fixture must start with an import");
  const edits = planImportJoin(parsed, declaration, names, DEFAULT_STYLE);
  if (edits === null) throw new Error("the braces were not found");
  return applyEdits(text, edits);
}

describe("planImportJoin", () => {
  it("adds names after the last one on a single line", () => {
    expect(joined(`import { a } from "m";`, ["b", "c"])).toBe(`import { a, b, c } from "m";`);
  });

  it("adds names after a trailing comma on a single line", () => {
    expect(joined(`import { a, } from "m";`)).toBe(`import { a, defineMockServer, } from "m";`);
  });

  it("adds names on lines of their own in a multi-line import", () => {
    expect(joined(`import {\n  a,\n  b,\n} from "m";`)).toBe(
      `import {\n  a,\n  b,\n  defineMockServer,\n} from "m";`,
    );
  });

  it("finds the braces past comments", () => {
    expect(joined(`import /* { */ { a /* } */ } from "m";`)).toBe(
      `import /* { */ { a, defineMockServer /* } */ } from "m";`,
    );
  });

  it("keeps type modifiers on the names already there", () => {
    expect(joined(`import { type A } from "m";`)).toBe(
      `import { type A, defineMockServer } from "m";`,
    );
  });
});
