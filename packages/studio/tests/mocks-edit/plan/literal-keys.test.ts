import type { ParsedSource } from "@noverax/courier-cli/devkit";
import { parseSource } from "@noverax/courier-cli/devkit";
import type { ObjectExpression } from "oxc-parser";
import { describe, expect, it } from "vitest";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import { readLiteralKeys } from "../../../src/server/mocks-edit/plan/literal-keys";

function objectIn(text: string): { parsed: ParsedSource; object: ObjectExpression } {
  const parsed = parseSource("courier.mocks.ts", text);
  const [statement] = parsed.program.body;
  if (
    statement?.type !== "ExportDefaultDeclaration" ||
    statement.declaration.type !== "ObjectExpression"
  ) {
    throw new Error("the fixture must export an object");
  }
  return { parsed, object: statement.declaration };
}

function outcome(text: string): string[] | string {
  const { parsed, object } = objectIn(text);
  try {
    return readLiteralKeys(object, parsed);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return `${err.code}: ${err.message}`;
    throw err;
  }
}

describe("readLiteralKeys", () => {
  it("reads plain, shorthand and string keys in order", () => {
    expect(outcome(`export default { a: 1, b, "c d": 2, __proto__ };`)).toEqual([
      "a",
      "b",
      "c d",
      "__proto__",
    ]);
  });

  it("refuses a setter", () => {
    expect(outcome("export default {\n  set a(v) {},\n};")).toBe(
      "MOCKS_NOT_LITERAL: courier.mocks.ts (line 2) declares a setter among the mocks; Studio adds only to an object of plain properties.",
    );
  });

  it("refuses a __proto__ written as a string key", () => {
    expect(outcome(`export default { "__proto__": null };`)).toBe(
      "MOCKS_KEYS_HIDDEN: courier.mocks.ts (line 1) sets the mocks object's prototype, which can supply keys Studio cannot see.",
    );
  });

  it("refuses a computed key even when it is a literal", () => {
    expect(outcome(`export default { ["a"]: 1 };`)).toBe(
      "MOCKS_KEYS_HIDDEN: courier.mocks.ts (line 1) computes a mock's key, so Studio cannot see every key.",
    );
  });
});
