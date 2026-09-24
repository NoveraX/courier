import { describe, expect, it } from "vitest";

import { findCommonJsExport } from "../../../src/server/mocks-edit/plan/commonjs-export";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function formOf(text: string): string | null {
  return findCommonJsExport(parseSource("x.ts", text).program)?.form ?? null;
}

describe("findCommonJsExport", () => {
  it("finds assignments to module.exports, its properties and exports", () => {
    expect(formOf("module.exports = {};")).toBe("module.exports");
    expect(formOf(`module["exports"] = {};`)).toBe("module.exports");
    expect(formOf("module.exports.users = 1;")).toBe("module.exports");
    expect(formOf("exports.users = 1;")).toBe("exports");
    expect(formOf("exports.a.b = 1;")).toBe("exports");
  });

  it("finds export =", () => {
    expect(formOf("export = {};")).toBe("export =");
  });

  it("ignores other assignments and ES exports", () => {
    expect(
      formOf("module.id = 1;\nconst exportsLike = {};\nexportsLike.a = 1;\nexport default {};\n"),
    ).toBeNull();
  });
});
