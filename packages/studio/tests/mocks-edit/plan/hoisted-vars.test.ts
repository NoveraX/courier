import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { hoistedVars } from "../../../src/server/mocks-edit/plan/hoisted-vars";

function hoistedIn(text: string): string[] {
  const [statement] = parseSource("x.ts", text).program.body;
  if (statement === undefined) throw new Error("the fixture must hold a statement");
  return hoistedVars(statement).map((declaration) =>
    text.slice(declaration.start, declaration.end),
  );
}

describe("hoistedVars", () => {
  it("returns the var declarations below a statement, in source order", () => {
    expect(hoistedIn("if (x) { var a = 1; } else { for (var b of c) { var d; } }")).toEqual([
      "var a = 1;",
      "var b",
      "var d;",
    ]);
  });

  it("returns nothing for block-scoped declarations, or anything inside a function or class", () => {
    expect(
      hoistedIn("{ let a; const b = 1; function c() { var d; } class E { m() { var f; } } }"),
    ).toEqual([]);
  });

  it("looks past a loop head that assigns rather than declares", () => {
    expect(hoistedIn("for (x of y) { var a; }")).toEqual(["var a;"]);
  });

  it("returns nothing for the top-level declaration itself", () => {
    expect(hoistedIn("var a = 1;")).toEqual([]);
  });
});
