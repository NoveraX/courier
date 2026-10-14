import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { readMockImports } from "../../../src/server/mocks-edit/plan/read-mock-imports";

function importsOf(text: string) {
  return readMockImports(parseSource("x.ts", text).program);
}

/* An optional call comes wrapped in a ChainExpression; the callee inside it
   still carries the `optional` flag the check looks at. */

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
