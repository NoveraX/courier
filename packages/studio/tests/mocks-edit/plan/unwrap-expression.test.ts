import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { unwrapExpression } from "../../../src/server/mocks-edit/plan/unwrap-expression";

function unwrapped(expressionText: string): string {
  const text = `export default ${expressionText};`;
  const [statement] = parseSource("x.ts", text).program.body;
  if (
    statement?.type !== "ExportDefaultDeclaration" ||
    statement.declaration.type === "FunctionDeclaration"
  ) {
    throw new Error("the fixture must export an expression");
  }
  const declaration = statement.declaration;
  if (declaration.type === "ClassDeclaration" || declaration.type === "TSInterfaceDeclaration") {
    throw new Error("the fixture must export an expression");
  }
  const inner = unwrapExpression(declaration);
  return text.slice(inner.start, inner.end);
}

describe("unwrapExpression", () => {
  it("looks through nested parentheses, as, satisfies, ! and <T>", () => {
    expect(unwrapped("((<A>({ a: 1 } as B)!) satisfies C)")).toBe("{ a: 1 }");
  });

  it("leaves other expressions as they are", () => {
    expect(unwrapped("f({ a: 1 })")).toBe("f({ a: 1 })");
    expect(unwrapped("[{ a: 1 }]")).toBe("[{ a: 1 }]");
  });
});
