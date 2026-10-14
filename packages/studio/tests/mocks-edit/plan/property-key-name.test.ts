import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { propertyKeyName } from "../../../src/server/mocks-edit/plan/property-key-name";

function keysOf(objectText: string): Array<string | null> {
  const [statement] = parseSource("x.ts", `export default ${objectText};`).program.body;
  if (
    statement?.type !== "ExportDefaultDeclaration" ||
    statement.declaration.type !== "ObjectExpression"
  ) {
    throw new Error("the fixture must be an object");
  }
  return statement.declaration.properties.map((p) =>
    p.type === "Property" ? propertyKeyName(p.key) : null,
  );
}

describe("propertyKeyName", () => {
  it("reads identifiers, strings, numbers and bigints as Object.keys reports them", () => {
    expect(keysOf(`{ a: 1, "b c": 2, 1.50: 3, 1e21: 4, 10n: 5 }`)).toEqual([
      "a",
      "b c",
      "1.5",
      "1e+21",
      "10",
    ]);
  });

  /* Callers refuse a computed key before asking for its name; a template
     literal is the one key form with no name to give. */
  it("returns null for a template-literal key", () => {
    expect(keysOf("{ [`a`]: 1 }")).toEqual([null]);
  });
});
