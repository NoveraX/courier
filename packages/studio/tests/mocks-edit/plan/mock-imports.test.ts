import type { Expression } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { isMockCallee, readMockImports } from "../../../src/server/mocks-edit/plan/mock-imports";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

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

describe("readMockImports", () => {
  it("reads value imports of both entries, under their local names", () => {
    const text = [
      `import { defineMocks as mocks, defineMockServer } from "@noverax/courier-mock";`,
      `import { defineMockServer as server } from "@noverax/courier-mock/managed";`,
      `import * as courier from "@noverax/courier-mock/managed";`,
    ].join("\n");

    const imports = importsOf(text);

    expect([...imports.named]).toEqual([
      ["defineMocks", ["mocks"]],
      ["defineMockServer", ["defineMockServer", "server"]],
    ]);
    expect(imports.namespaces).toEqual(["courier"]);
  });

  it("skips type-only imports and other packages", () => {
    const text = [
      `import type { defineMocks } from "@noverax/courier-mock";`,
      `import { type defineMockServer } from "@noverax/courier-mock";`,
      `import { defineMockServer as other } from "@noverax/courier-mock-extra";`,
    ].join("\n");

    const imports = importsOf(text);

    expect([...imports.named]).toEqual([]);
    expect(imports.namespaces).toEqual([]);
  });

  it("offers the first root import with only named specifiers for new names to join", () => {
    const text = [
      `import * as ns from "@noverax/courier-mock";`,
      `import { defineMocks } from "@noverax/courier-mock/managed";`,
      `import { type MockServerDefinition } from "@noverax/courier-mock";`,
      `import { defineMocks as again } from "@noverax/courier-mock";`,
    ].join("\n");

    expect(importsOf(text).joinable?.start).toBe(text.indexOf(`import { type`));
  });

  it("offers none when the root import mixes in a default or is type-only", () => {
    const text = [
      `import def, { a } from "@noverax/courier-mock";`,
      `import type { b } from "@noverax/courier-mock";`,
      `import "@noverax/courier-mock";`,
    ].join("\n");

    expect(importsOf(text).joinable).toBeNull();
  });
});

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
