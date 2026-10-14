import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { findDefaultExport } from "../../../src/server/mocks-edit/plan/default-export";

function kindOf(text: string): string | null {
  const found = findDefaultExport(parseSource("x.ts", text).program);
  if (found === null) return null;
  switch (found.kind) {
    case "expression":
      return `expression ${found.expression.type} in statement ${found.statement}`;
    case "binding":
      return `binding ${found.name}`;
    case "other":
      return `other: ${found.what}`;
    case "several":
      return "several";
    case "type":
      return "type";
  }
}

describe("findDefaultExport", () => {
  it("finds export default of an expression", () => {
    expect(kindOf("const a = 1;\nexport default { a };\n")).toBe(
      "expression ObjectExpression in statement 1",
    );
  });

  it("finds export { x as default }, also written as a string", () => {
    expect(kindOf("const x = {};\nexport { x as default };\n")).toBe("binding x");
    expect(kindOf(`const x = {};\nexport { x as "default" };\n`)).toBe("binding x");
  });

  it("names what cannot hold an object literal", () => {
    expect(kindOf("export default class {}\n")).toBe("other: a function or class");
    expect(kindOf("export default function mocks() {}\n")).toBe("other: a function or class");
    expect(kindOf(`export { default } from "./m";\n`)).toBe(
      `other: a value re-exported from "./m"`,
    );
    expect(kindOf(`export * as default from "./m";\n`)).toBe(
      `other: a namespace re-exported from "./m"`,
    );
  });

  it("reports a type-only default export, when it is the only one, as a type", () => {
    expect(kindOf("export default interface Mocks {}\n")).toBe("type");
    expect(kindOf(`export type { Mocks as default } from "./t";\n`)).toBe("type");
    expect(kindOf(`export { type Mocks as default } from "./t";\n`)).toBe("type");
    expect(kindOf("interface Mocks {}\nexport type { Mocks as default };\n")).toBe("type");
    expect(kindOf("interface Mocks {}\nexport { type Mocks as default };\n")).toBe("type");
    expect(kindOf(`export type * as default from "./t";\n`)).toBe("type");
  });

  it("does not count two type-only default exports as several", () => {
    const text = `export default interface Mocks {}\nexport type { T as default } from "./t";\n`;

    expect(kindOf(text)).toBe("type");
  });

  it("finds the runtime default beside a type-only one, before or after it", () => {
    expect(kindOf("export default interface Mocks {}\nexport default { a: 1 };\n")).toBe(
      "expression ObjectExpression in statement 1",
    );
    expect(kindOf("export default { a: 1 };\nexport default interface Mocks {}\n")).toBe(
      "expression ObjectExpression in statement 0",
    );
  });

  it("reports more than one runtime default export as several", () => {
    expect(kindOf("export default { a: 1 };\nconst m = {};\nexport { m as default };\n")).toBe(
      "several",
    );
    expect(kindOf("const a = {};\nconst b = {};\nexport { a as default, b as default };\n")).toBe(
      "several",
    );
  });

  it("returns null for a module without a default export", () => {
    expect(kindOf(`export const a = 1;\nexport * from "./m";\n`)).toBeNull();
  });
});
