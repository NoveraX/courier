import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import { importDeclaration } from "../../../src/server/mocks-edit/plan/import-declaration";

const NO_SEMICOLONS = { ...DEFAULT_STYLE, quote: "'" as const, semicolons: false };

describe("importDeclaration", () => {
  it("writes named imports, aliasing those bound under another name", () => {
    const names = [
      { imported: "defineMocks", local: "defineMocks" },
      { imported: "defineMockServer", local: "defineMockServer2" },
    ];

    expect(importDeclaration({ names }, "@noverax/courier-mock", NO_SEMICOLONS)).toBe(
      "import { defineMocks, defineMockServer as defineMockServer2 } from '@noverax/courier-mock'",
    );
  });

  it("writes a default import in the file's quote", () => {
    expect(
      importDeclaration({ defaultLocal: "courierConfig" }, "./courier.config", NO_SEMICOLONS),
    ).toBe(`import courierConfig from './courier.config'`);
  });

  it("ends the declaration with a semicolon only when the style uses them", () => {
    const clause = { defaultLocal: "courierConfig" };

    expect(importDeclaration(clause, "./courier.config", DEFAULT_STYLE)).toBe(
      `import courierConfig from "./courier.config";`,
    );
    expect(importDeclaration(clause, "./courier.config", NO_SEMICOLONS)).toBe(
      `import courierConfig from './courier.config'`,
    );
  });
});
