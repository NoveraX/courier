import { describe, expect, it } from "vitest";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import type { LocatedMocks } from "../../../src/server/mocks-edit/plan/locate-mocks-object";
import { locateMocksObject } from "../../../src/server/mocks-edit/plan/locate-mocks-object";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { readMockImports } from "../../../src/server/mocks-edit/plan/read-mock-imports";

const HEADER = `import { defineMocks } from "@noverax/courier-mock";\n`;

function locate(text: string): LocatedMocks {
  const parsed = parseSource("courier.mocks.ts", text);
  return locateMocksObject(parsed, readMockImports(parsed.program));
}

function summary(text: string): { statement: number; keys: string[]; object: string } | "absent" {
  const located = locate(text);
  if (located.kind === "absent") return "absent";
  return {
    statement: located.statement,
    keys: located.keys,
    object: text.slice(located.object.start, located.object.end),
  };
}

function refusal(text: string): string {
  try {
    locate(text);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return `${err.code}: ${err.message}`;
    throw err;
  }
  throw new Error("locateMocksObject did not refuse");
}

describe("locateMocksObject", () => {
  it("finds the object passed to defineMocks, and the statement holding it", () => {
    expect(summary(`${HEADER}export default defineMocks({ a: 1 });\n`)).toEqual({
      statement: 1,
      keys: ["a"],
      object: "{ a: 1 }",
    });
  });

  it("reads identifier, string and numeric keys as Object.keys would", () => {
    expect(summary(`export default { a: 1, "b-c": 2, 'd': 3, 1e3: 4, 0x10: 5, e };\n`)).toEqual({
      statement: 0,
      keys: ["a", "b-c", "d", "1000", "16", "e"],
      object: `{ a: 1, "b-c": 2, 'd': 3, 1e3: 4, 0x10: 5, e }`,
    });
  });

  it("keeps a key written twice, twice", () => {
    expect(summary("export default { a: 1, a: 2 };\n")).toEqual({
      statement: 0,
      keys: ["a", "a"],
      object: "{ a: 1, a: 2 }",
    });
  });

  it("points at the const's statement for a default export by name", () => {
    expect(
      summary(`${HEADER}const x = 1;\nconst mocks = { a: 1 };\nexport { mocks as default };\n`),
    ).toEqual({
      statement: 2,
      keys: ["a"],
      object: "{ a: 1 }",
    });
  });

  it("reports a file without a default export as absent", () => {
    expect(summary(`${HEADER}export const a = 1;\n`)).toBe("absent");
  });

  it("refuses a const holding another name", () => {
    expect(refusal("const a = {};\nconst b = a;\nexport default b;\n")).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts does not export an object literal Studio can add to.",
    );
  });

  it("refuses a const declared without a value", () => {
    expect(refusal("declare const mocks: object;\nexport default mocks;\n")).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts exports mocks, which is declared with const and no value; Studio adds mocks only to an object held by a const.",
    );
  });

  it("refuses a destructured binding", () => {
    expect(refusal("const { mocks } = source;\nexport default mocks;\n")).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts exports mocks, which is not a const declared in the file.",
    );
  });

  it("refuses an optional call", () => {
    expect(
      refusal(`import * as m from "@noverax/courier-mock";\nexport default m?.defineMocks({});\n`),
    ).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts does not export an object literal Studio can add to.",
    );
  });

  it("refuses a spread argument and shortens a long callee in the message", () => {
    expect(refusal(`${HEADER}export default defineMocks(...parts);\n`)).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts calls defineMocks with something other than one object literal.",
    );
    expect(refusal(`export default ${"a".repeat(70)}({});\n`)).toBe(
      `MOCKS_NOT_LITERAL: courier.mocks.ts exports the result of ${"a".repeat(60)}…(…), not of defineMocks from @noverax/courier-mock.`,
    );
  });

  it.each([
    "export default interface Mocks {}\n",
    "type Mocks = {};\nexport type { Mocks as default };\n",
    "interface Mocks {}\nexport { type Mocks as default };\n",
    `export type { Mocks as default } from "./types";\n`,
    `export type * as default from "./types";\n`,
  ])("refuses a file whose only default export is a type: %j", (text) => {
    expect(refusal(text)).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts already declares a type as its default export, and TypeScript allows one default export per module, so Studio cannot add defineMocks as the default.",
    );
  });

  it("finds no mocks object in a file without a default export", () => {
    expect(locate(`${HEADER}export type Mocks = {};\n`)).toEqual({ kind: "absent" });
  });

  it("refuses a file with more than one default export", () => {
    expect(
      refusal(
        `${HEADER}export default defineMocks({});\nconst m = {};\nexport { m as default };\n`,
      ),
    ).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts declares more than one default export, so Studio cannot tell which one holds the mocks.",
    );
  });
});
