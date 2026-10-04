import type { Expression } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { isMockCallee } from "../../../src/server/mocks-edit/plan/is-mock-callee";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { readMockImports } from "../../../src/server/mocks-edit/plan/read-mock-imports";

function importsOf(text: string) {
  return readMockImports(parseSource("x.ts", text).program);
}

/* An optional call comes wrapped in a ChainExpression; the callee inside it
   still carries the `optional` flag the check looks at. */
function calleeOf(text: string): Expression {
  const program = parseSource("x.ts", text).program;
  const last = program.body[program.body.length - 1];
  if (last?.type !== "ExpressionStatement") throw new Error("the fixture must end with a call");
  const call =
    last.expression.type === "ChainExpression" ? last.expression.expression : last.expression;
  if (call.type !== "CallExpression") throw new Error("the fixture must end with a call");
  return call.callee;
}

describe("isMockCallee", () => {
  const header = `import { defineMockServer as server } from "@noverax/courier-mock";\nimport * as mock from "@noverax/courier-mock";\n`;

  it("accepts a local name the function is imported under", () => {
    const text = `${header}server({});`;

    expect(isMockCallee(calleeOf(text), "defineMockServer", importsOf(text))).toBe(true);
  });

  it("accepts namespace.name", () => {
    const text = `${header}mock.defineMockServer({});`;

    expect(isMockCallee(calleeOf(text), "defineMockServer", importsOf(text))).toBe(true);
  });

  it("looks through parentheses around the callee", () => {
    const text = `${header}(server)({});`;

    expect(isMockCallee(calleeOf(text), "defineMockServer", importsOf(text))).toBe(true);
  });

  it("rejects the function's own name when it is imported under another", () => {
    const text = `${header}defineMockServer({});`;

    expect(isMockCallee(calleeOf(text), "defineMockServer", importsOf(text))).toBe(false);
  });

  it("rejects another function of the namespace, a computed member and an optional call", () => {
    for (const call of [
      "mock.defineMocks({});",
      `mock["defineMockServer"]({});`,
      "mock?.defineMockServer({});",
    ]) {
      const text = `${header}${call}`;

      expect(isMockCallee(calleeOf(text), "defineMockServer", importsOf(text))).toBe(false);
    }
  });
});
